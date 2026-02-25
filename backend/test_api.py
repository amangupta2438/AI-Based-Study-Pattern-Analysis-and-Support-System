import requests
import time

BASE_URL = "http://localhost:8000"

def test_api():
    print("Waiting for server to start...")
    # Simple retry mechanism
    for _ in range(5):
        try:
            r = requests.get(BASE_URL + "/")
            if r.status_code == 200:
                print("Server is UP!")
                break
        except requests.exceptions.ConnectionError:
            time.sleep(1)
    else:
        print("Server failed to start.")
        return

    # Test Log Session
    print("Testing /log_session...")
    session_data = {
        "subject": "Math",
        "duration_minutes": 60,
        "focus_rating": 8,
        "notes": "Calculus integration"
    }
    r = requests.post(f"{BASE_URL}/log_session", json=session_data)
    if r.status_code == 200:
        print("✅ Log Session Passed")
    else:
        print(f"❌ Log Session Failed: {r.text}")

    # Test Analysis
    print("Testing /analysis...")
    r = requests.get(f"{BASE_URL}/analysis")
    if r.status_code == 200:
        data = r.json()
        print(f"✅ Analysis Passed. Suggestion: {data['suggestion']}")
    else:
        print(f"❌ Analysis Failed: {r.text}")

if __name__ == "__main__":
    test_api()
