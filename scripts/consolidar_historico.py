"""
Consolida o histórico da tabela geral do Prêmio CNJ (arquivos PrêmioGeral-DD-MM-AAAA.xlsx,
os mesmos que o Telegram envia) a partir dos artefatos "Diferencas_CNJ" do Actions,
em um único arquivo para alimentar o dashboard de evolução dos tribunais.

Roda dentro do GitHub Actions (usa a CLI `gh` já autenticada via GH_TOKEN).
Saídas: historico_premio_geral.csv e historico_premio_geral.parquet (se possível)
"""
import io
import os
import re
import hashlib
import subprocess
import zipfile

import pandas as pd

REPO = os.environ.get("GITHUB_REPOSITORY", "marcusvinicius98/Monitor-Premio")
SAIDA_CSV = "historico_premio_geral.csv"
SAIDA_PARQUET = "historico_premio_geral.parquet"

# Nome do arquivo: PrêmioGeral-07-10-2026.xlsx (aceita variações de acento/codificação)
PADRAO_ARQUIVO = re.compile(r"Pr.mioGeral-(\d{2})-(\d{2})-(\d{4})\.xlsx$", re.IGNORECASE)

# 1) Lista todos os artefatos Diferencas_CNJ ainda não expirados
saida = subprocess.run(
    [
        "gh", "api", "--paginate",
        f"repos/{REPO}/actions/artifacts?per_page=100&name=Diferencas_CNJ",
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
print(f"{len(artefatos)} artefatos Diferencas_CNJ encontrados")

# 2) Baixa cada um, pega o PrêmioGeral-*.xlsx e descarta versões idênticas à anterior
partes = []
hash_anterior = None
sem_premio_geral = 0
falhas = 0

for art_id, criado_em, run_id in artefatos:
    try:
        bruto = subprocess.run(
            ["gh", "api", f"repos/{REPO}/actions/artifacts/{art_id}/zip"],
            check=True, capture_output=True,
        ).stdout

        with zipfile.ZipFile(io.BytesIO(bruto)) as z:
            achados = [n for n in z.namelist() if PADRAO_ARQUIVO.search(os.path.basename(n))]
            if not achados:
                sem_premio_geral += 1
                continue
            nome = achados[0]
            with z.open(nome) as f:
                df = pd.read_excel(f)

    except Exception as e:
        falhas += 1
        print(f"  {art_id}: falhou ({e})")
        continue

    # Data do arquivo (a que aparece no nome enviado ao Telegram)
    m = PADRAO_ARQUIVO.search(os.path.basename(nome))
    data_arquivo = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

    # Hash do conteúdo para pular tabelas sem mudança
    hash_atual = hashlib.sha256(df.to_csv(index=False).encode("utf-8")).hexdigest()
    if hash_atual == hash_anterior:
        continue
    hash_anterior = hash_atual

    df.insert(0, "data_arquivo", data_arquivo)
    df.insert(1, "snapshot_utc", criado_em)
    df.insert(2, "run_id", run_id)
    partes.append(df)
    print(f"  {data_arquivo} ({criado_em}): {len(df)} linhas")

# 3) Junta tudo e grava
if not partes:
    raise SystemExit("Nenhuma tabela PrêmioGeral encontrada nos artefatos")

historico = pd.concat(partes, ignore_index=True)
historico.to_csv(SAIDA_CSV, index=False, encoding="utf-8-sig")
print(
    f"{len(partes)} versões distintas, {len(historico)} linhas, "
    f"{sem_premio_geral} artefatos sem PrêmioGeral, {falhas} falhas -> {SAIDA_CSV}"
)

try:
    historico.to_parquet(SAIDA_PARQUET, index=False)
except Exception as e:
    print(f"Parquet não gerado ({e}); use o CSV")
