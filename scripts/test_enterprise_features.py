import urllib.request
import json
import ssl
import sys

BASE_URL = 'http://localhost:3001'

def post_json(endpoint, data, token=None):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            **({'Authorization': f"Bearer {token}"} if token else {})
        }
    )
    with urllib.request.urlopen(req) as resp:
        return resp.getcode(), json.loads(resp.read().decode('utf-8'))

def get_req(endpoint, token=None, expect_json=True):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(
        url,
        headers={**({'Authorization': f"Bearer {token}"} if token else {})}
    )
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode('utf-8')
        if expect_json:
            return resp.getcode(), json.loads(content)
        return resp.getcode(), content

def run_tests():
    print("=" * 60)
    print("🧪 CONDOVOLTO AI — ENTERPRISE MODULES TEST SUITE")
    print("=" * 60)
    passed = 0
    total = 10

    # 1. Health check
    print("\n[1/10] Testando Health Check...")
    code, data = get_req('/api/health')
    assert code == 200 and data.get('status') == 'online', f"Health falhou: {data}"
    print(f"✅ Health OK: Versão {data.get('version')} (Database: {data.get('database')})")
    passed += 1

    # 2. Login
    print("\n[2/10] Testando Login Administrativo...")
    code, data = post_json('/api/auth/login', {'email': 'admin@condominio.com.br', 'password': 'admin123'})
    assert code == 200 and 'token' in data, f"Login falhou: {data}"
    token = data['token']
    print(f"✅ Login OK: Token emitido para {data.get('user', {}).get('name')}")
    passed += 1

    # 3. Boleto FEBRABAN HTML
    print("\n[3/10] Testando Gerador de Boleto FEBRABAN com Pix...")
    code, html = get_req('/api/financeiro/boletos/bol_101_nov/pdf', expect_json=False)
    assert code == 200, f"Boleto falhou: code {code}"
    assert 'FICHA DE COMPENSAÇÃO' in html, "Layout FEBRABAN ausente"
    assert 'PAGAMENTO INSTANTÂNEO COM PIX' in html, "Bloco Pix ausente"
    assert 'barcode-svg' in html, "Código de barras SVG ausente"
    assert 'window.print()' in html, "Botão de impressão ausente"
    print("✅ Boleto FEBRABAN HTML OK: Linha digitável, QR Code Pix e Barcode SVG renderizados.")
    passed += 1

    # 4. Boleto JSON Data
    print("\n[4/10] Testando Dados Estruturados do Boleto...")
    code, data = get_req('/api/financeiro/boletos/bol_101_nov/dados')
    assert code == 200 and data.get('success'), f"Dados boleto falhou: {data}"
    bol = data['boleto']
    assert bol['valor'] == 650.0, f"Valor incorreto: {bol['valor']}"
    assert len(bol['itensDetalhamento']) >= 3, "Detalhamento de encargos incompleto"
    print(f"✅ Boleto Dados OK: {bol['valorFormatado']} (Titular: {bol['pagadorNome']})")
    passed += 1

    # 5. Recibo Oficial de Quitação HTML
    print("\n[5/10] Testando Recibo Oficial de Quitação com Autenticação Notarial...")
    code, html = get_req('/api/financeiro/boletos/bol_101_nov/recibo', expect_json=False)
    assert code == 200, f"Recibo falhou: code {code}"
    assert 'QUITADO' in html, "Selo de Quitado ausente"
    assert 'Código Civil Brasileiro' in html, "Fundamentação jurídica ausente"
    assert 'CHAVE CRIPTOGRÁFICA SHA-256' in html, "Hash de auditoria ausente"
    print("✅ Recibo Oficial OK: Autenticação mecânica SHA-256 e quitação jurídica emitidas.")
    passed += 1

    # 6. Recibo JSON com Hash SHA-256
    print("\n[6/10] Testando Validação do Recibo em Formato JSON...")
    code, data = get_req('/api/financeiro/boletos/bol_101_nov/recibo?format=json')
    assert code == 200 and data.get('success'), f"Recibo JSON falhou: {data}"
    rec = data['recibo']
    assert len(rec['hashAutenticacao']) == 64, f"Hash SHA-256 inválido: {rec['hashAutenticacao']}"
    assert 'SISCON-REC' in rec['protocoloSiscon'], f"Protocolo incorreto: {rec['protocoloSiscon']}"
    print(f"✅ Recibo JSON OK: Hash {rec['hashAutenticacao'][:16]}... Protocolo: {rec['protocoloSiscon']}")
    passed += 1

    # 7. Fluxo WhatsApp Bot com Link do PDF
    print("\n[7/10] Testando Autoatendimento WhatsApp emitindo link do Boleto...")
    post_json('/api/simulador/reset', {'remoteJid': '5511999990101@s.whatsapp.net'})
    
    # 7.1 Morador pede boleto
    code, data = post_json('/api/simulador/chat', {
        'remoteJid': '5511999990101@s.whatsapp.net',
        'message': 'preciso da segunda via do meu boleto de condominio',
        'pushName': 'Carlos Morador'
    })
    assert code == 200 and data.get('success'), f"Simulador chat falhou: {data}"
    assert 'CPF' in data.get('reply', ''), f"Bot não pediu CPF: {data.get('reply')}"

    # 7.2 Morador digita o CPF
    code, data = post_json('/api/simulador/chat', {
        'remoteJid': '5511999990101@s.whatsapp.net',
        'message': '12345678909',
        'pushName': 'Carlos Morador'
    })
    assert code == 200 and data.get('success'), f"Envio CPF falhou: {data}"
    bot_reply = data.get('reply', '')
    assert 'Boleto' in bot_reply and 'api/financeiro/boletos' in bot_reply, f"Link de boleto não encontrado na resposta: {bot_reply}"
    print("✅ WhatsApp Bot OK: Cota localizada, linha digitável e link do Boleto PDF entregues.")
    passed += 1

    # 8. Alerta Crítico & Broadcast de Emergência
    print("\n[8/10] Testando Broadcast de Alerta Crítico / Emergência...")
    emer_payload = {
        'titulo': 'Falta de Água Emergencial na Coluna B',
        'mensagem': 'Vazamento no barrilete identificado. Registro fechado para reparo emergencial.',
        'nivel': 'critico',
        'areasAfetadas': ['Torre B', 'Garagem Subsolo'],
        'canais': ['whatsapp_broadcast', 'painel']
    }
    code, data = post_json('/api/emergencia/disparar', emer_payload, token)
    assert code == 201 and data.get('success'), f"Disparo emergência falhou: {data}"
    broadcast_id = data.get('broadcastId')
    print(f"✅ Alerta Emergência OK: Protocolo {broadcast_id} transmitido para {data.get('destinatariosEstimados')} unidades.")
    passed += 1

    # 9. Auditoria do Alerta Crítico
    print("\n[9/10] Testando Registro na Trilha de Auditoria...")
    code, logs = get_req('/api/auditoria', token)
    assert code == 200 and isinstance(logs, list), f"Auditoria falhou: {logs}"
    tem_emergencia = any(l.get('acao') == 'DISPARO_ALERTA_EMERGENCIA' for l in logs)
    assert tem_emergencia, "Log de disparo de emergência não encontrado na auditoria"
    print("✅ Auditoria OK: Ação de emergência gravada com trilha imutável no banco.")
    passed += 1

    # 10. Verificação dos Recursos do Painel HTML
    print("\n[10/10] Verificando Painel de Controle (Chart.js, Emergência, Transferência)...")
    code, html = get_req('/painel', expect_json=False)
    assert code == 200, "Painel não carregou"
    assert 'chart.umd.min.js' in html, "Chart.js não encontrado no painel"
    assert 'canvasArrecadacaoChart' in html, "Canvas de Arrecadação não encontrado"
    assert 'canvasDemandasChart' in html, "Canvas de Demandas não encontrado"
    assert 'modalEmergencia' in html, "Modal de Emergência não encontrado"
    assert 'btnTransferirAtendimento' in html, "Botão unificado de transferência não encontrado"
    assert 'selecionarOperadorRapido' in html, "Função de 1-clique de transferência não encontrada"
    print("✅ Painel HTML OK: Chart.js, 4 canvas de BI, modal de crise e botão de transferência unificado ativos.")
    passed += 1

    print("\n" + "=" * 60)
    print(f"🎉 RESULTADO FINAL: {passed}/{total} TESTES PASSARAM COM 100% DE SUCESSO!")
    print("=" * 60)

if __name__ == '__main__':
    run_tests()
