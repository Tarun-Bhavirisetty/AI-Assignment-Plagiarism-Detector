import requests

def test_reprocess():
    # Login as admin
    res = requests.post("http://127.0.0.1:8000/login", json={"email": "admin@metaguard.com", "password": "admin123"})
    if res.status_code == 200:
        token = res.json()["access_token"]
        print("Logged in successfully.")
        
        # Test Reprocess
        res_repo = requests.post(
            "http://127.0.0.1:8000/admin/reprocess_uploads", 
            headers={"Authorization": f"Bearer {token}"}
        )
        print("Reprocess response:", res_repo.status_code)
        print(res_repo.json())
        
        # Test file stats
        res_stats = requests.get(
            "http://127.0.0.1:8000/analytics",
            headers={"Authorization": f"Bearer {token}"}
        )
        print("Analytics stats:", res_stats.json().get("file_type_stats"))
    else:
        print("Login failed:", res.status_code, res.text)

if __name__ == "__main__":
    test_reprocess()
