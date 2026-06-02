from fastapi.testclient import TestClient
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from main import app

client = TestClient(app)

res_login = client.post("/login", json={"email": "admin@metaguard.com", "password": "admin123"})
if res_login.status_code == 200:
    token = res_login.json()["access_token"]
    res = client.get("/admin/uploads", headers={"Authorization": f"Bearer {token}"})
    print(res.status_code)
    try:
        data = res.json()
        print("LENGTH:", len(data))
        print("Response:", data)
    except Exception as e:
        print("JSON ERROR", e)
else:
    print("Login failed", res_login.status_code, res_login.text)
