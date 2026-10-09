from conftest import login, register


def create(client, username="bob", password="bob-password", is_admin=False):
    return client.post(
        "/api/users",
        json={"username": username, "password": password, "isAdmin": is_admin},
    )


def test_admin_lists_users_with_board_counts(user_client):
    users = user_client.get("/api/users").json()
    assert len(users) == 1
    assert users[0]["username"] == "user"
    assert users[0]["isAdmin"] is True
    assert users[0]["boardCount"] == 1
    assert users[0]["createdAt"].endswith("Z")


def test_admin_creates_user_who_can_log_in(user_client, client):
    response = create(user_client)
    assert response.status_code == 201
    assert response.json()["username"] == "bob"
    assert [u["username"] for u in user_client.get("/api/users").json()] == ["user", "bob"]
    user_client.post("/api/logout")
    assert login(client, "bob", "bob-password").status_code == 200
    assert len(client.get("/api/boards").json()) == 1


def test_admin_create_duplicate_is_409(user_client):
    create(user_client)
    assert create(user_client, "BOB").status_code == 409


def test_admin_create_invalid_is_422(user_client):
    assert create(user_client, "b").status_code == 422
    assert create(user_client, password="short").status_code == 422


def test_admin_resets_password(user_client, client):
    bob_id = create(user_client).json()["id"]
    response = user_client.patch(f"/api/users/{bob_id}", json={"password": "reset-password"})
    assert response.status_code == 200
    user_client.post("/api/logout")
    assert login(client, "bob", "bob-password").status_code == 401
    assert login(client, "bob", "reset-password").status_code == 200


def test_admin_grants_and_revokes_admin(user_client):
    bob_id = create(user_client).json()["id"]
    granted = user_client.patch(f"/api/users/{bob_id}", json={"isAdmin": True})
    assert granted.json() == {"id": bob_id, "username": "bob", "isAdmin": True}
    revoked = user_client.patch(f"/api/users/{bob_id}", json={"isAdmin": False})
    assert revoked.json()["isAdmin"] is False


def test_admin_cannot_demote_self(user_client):
    response = user_client.patch("/api/users/1", json={"isAdmin": False})
    assert response.status_code == 400
    assert user_client.get("/api/me").json()["isAdmin"] is True


def test_admin_can_reset_own_password(user_client):
    response = user_client.patch("/api/users/1", json={"password": "another-pass"})
    assert response.status_code == 200
    user_client.post("/api/logout")
    assert login(user_client, password="another-pass").status_code == 200


def test_admin_cannot_delete_self(user_client):
    assert user_client.delete("/api/users/1").status_code == 400
    assert user_client.get("/api/me").status_code == 200


def test_admin_deletes_user_and_their_boards(user_client, client):
    bob_id = create(user_client).json()["id"]
    assert user_client.delete(f"/api/users/{bob_id}").status_code == 204
    assert [u["username"] for u in user_client.get("/api/users").json()] == ["user"]
    assert login(client, "bob", "bob-password").status_code == 401


def test_admin_unknown_user_is_404(user_client):
    assert user_client.patch("/api/users/999", json={"isAdmin": True}).status_code == 404
    assert user_client.delete("/api/users/999").status_code == 404


def test_non_admin_is_403_on_admin_routes(client):
    register(client, "alice")
    assert client.get("/api/users").status_code == 403
    assert create(client).status_code == 403
    assert client.patch("/api/users/1", json={"isAdmin": False}).status_code == 403
    assert client.delete("/api/users/1").status_code == 403


def test_admin_routes_require_session(client):
    assert client.get("/api/users").status_code == 401
    assert create(client).status_code == 401
