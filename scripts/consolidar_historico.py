"""
Consolida o histórico de snapshots da tabela do CNJ (artefatos "prev_tabela" do Actions)
em um único arquivo, para alimentar o dashboard de evolução dos tribunais.

Roda dentro do GitHub Actions (usa a CLI `gh` já autenticada via GH_TOKEN).
Saídas: historico_prev_tabela.csv e historico_prev_tabela.parquet (se possível)
"""
import io
import os
import hashlib
import subprocess
import zipfile

import pandas as pd

REPO = os.environ.get("GITHUB_REPOSITORY", "marcusvinicius98/Monitor-Premio")
SAIDA_CSV = "historico_prev_tabela.csv"
SAIDA_PARQUET = "historico_prev_tabela.parquet"

# 1) Lista todos os artefatos prev_tabela ainda não expirados
saida = subprocess.run(
    [
        "gh", "api", "--paginate",
        f"repos/{REPO}/actions/artifacts?per_page=100&name=prev_tabela",
        "--jq",
        '.artifacts[] | select(.expired==false) | [.id, .created_at, (.workflow_run.id // "")] | @tsv',
    ],
    check=True, capture_output=True, text=True,
).stdout

artefatos = []
for linha in saida.strip().splitlines():
    art_id, criado_em, run_id = linha.split("\t")
    artefatos.append((art_id, criado_em, run_id))

# Ordem cronológica (do mais antigo para o mais novo)
artefatos.sort(key=lambda x: x[1])
print(f"{len(artefatos)} artefatos prev_tabela encontrados")

# 2) Baixa cada um, lê a planilha e descarta snapshots idênticos ao anterior
partes = []
hash_anterior = None
falhas = 0

for art_id, criado_em, run_id in artefatos:
    try:
        bruto = subprocess.run(
            ["gh", "api", f"repos/{REPO}/actions/artifacts/{art_id}/zip"],
            check=True, capture_output=True,
        ).stdout

        with zipfile.ZipFile(io.BytesIO(bruto)) as z:
            nomes = [n for n in z.namelist() if n.lower().endswith(".xlsx")]
            if not nomes:
                print(f"  {art_id}: sem xlsx, ignorado")
                continue
            with z.open(nomes[0]) as f:
                df = pd.read_excel(f)

    except Exception as e:
        falhas += 1
        print(f"  {art_id}: falhou ({e})")
        continue

    # Hash do conteúdo para pular snapshots sem mudança
    hash_atual = hashlib.sha256(df.to_csv(index=False).encode("utf-8")).hexdigest()
    if hash_atual == hash_anterior:
        continue
    hash_anterior = hash_atual

    df.insert(0, "snapshot_utc", criado_em)
    df.insert(1, "run_id", run_id)
    partes.append(df)
    print(f"  {criado_em}: {len(df)} linhas")

# 3) Junta tudo e grava
if not partes:
    raise SystemExit("Nenhum snapshot válido encontrado")

historico = pd.concat(partes, ignore_index=True)
historico.to_csv(SAIDA_CSV, index=False, encoding="utf-8-sig")
print(f"{len(partes)} snapshots distintos, {len(historico)} linhas, {falhas} falhas -> {SAIDA_CSV}")

try:
    historico.to_parquet(SAIDA_PARQUET, index=False)
except Exception as e:
    print(f"Parquet não gerado ({e}); use o CSV")
