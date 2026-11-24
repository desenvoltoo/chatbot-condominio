import urllib.request, json, time, sys

time.sleep(2) # Give server 2s to boot

base_url = 'http://localhost:3001'

endpoints = [
    ('/api/health', 'GET'),
    ('/painel', 'GET'),
    ('/api/macros', 'GET'),
    ('/api/csat/metricas', 'GET'),
    ('/api/financeiro/regua/historico', 'GET')
]

# We need an auth token or bypass for public/auth routes
# Let's first test health and painel, then login to get auth token
print("--- 1. Testing Public Endpoints ---")
for ep, method in [('/api/health', 'GET'), ('/painel', 'GET')]:
    try:
        req = urllib.request.Request(f"{base_url}{ep}", headers={'User-Agent': 'TestRunner'})
        with urllib.request.urlopen(req, timeout=5) as res:
            status = res.status
            content = res.read().decode('utf-8', errors='ignore')
            print(f"[{method}] {ep} -> Status: {status} (Length: {len(content)} bytes)")
    except Exception as e:
        print(f"[{method}] {ep} -> Error: {e}")

# Login to get JWT
print("\n--- 2. Testing Login to Obtain Token ---")
token = ''
try:
    login_data = json.dumps({'email': 'admin@condominio.com.br', 'password': 'admin123'}).encode('utf-8')
    req = urllib.request.Request(f"{base_url}/api/auth/login", data=login_data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=5) as res:
        d = json.loads(res.read().decode('utf-8'))
        token = d.get('token', '')
        print(f"Login success! Operator: {d.get('user', {}).get('nome')} | Token: {token[:20]}...")
except Exception as e:
    print(f"Login failed: {e}")

if token:
    print("\n--- 3. Testing Authenticated Endpoints ---")
    auth_headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    for ep in ['/api/macros', '/api/csat/metricas', '/api/financeiro/regua/historico']:
        try:
            req = urllib.request.Request(f"{base_url}{ep}", headers=auth_headers)
            with urllib.request.urlopen(req, timeout=5) as res:
                content = res.read().decode('utf-8', errors='ignore')
                print(f"[GET] {ep} -> Status: {res.status} | Data: {content[:150]}...")
        except Exception as e:
            print(f"[GET] {ep} -> Error: {e}")

    # Test executing the regua preventiva endpoint
    print("\n--- 4. Testing POST /api/financeiro/regua/executar ---")
    try:
        req = urllib.request.Request(f"{base_url}/api/financeiro/regua/executar", data=b'{}', headers=auth_headers, method='POST')
        with urllib.request.urlopen(req, timeout=5) as res:
            resp_data = json.loads(res.read().decode('utf-8'))
            print("Executar Régua Response:", json.dumps(resp_data, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"POST /api/financeiro/regua/executar -> Error: {e}")
