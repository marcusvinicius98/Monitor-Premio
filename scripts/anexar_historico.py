"""
Registra a versão mais recente da tabela geral (PrêmioGeral-DD-MM-AAAA.xlsx, gerada pelo monitor
quando detecta mudança) no histórico data/historico_premio_geral.csv.

- Só acrescenta se o conteúdo for diferente da última versão já registrada.
- Colunas acrescentadas: data_arquivo (data do nome do arquivo), snapshot_utc e run_id (execução do Actions).
- Atualiza também o parquet (se o pyarrow estiver instalado).

Uso (a partir da raiz do repositório, depois do monitor):
    python scripts/anexar_historico.py
"""
import datetime
import glob
import hashlib
import os
import re

import pandas as pd

CSV = "data/historico_premio_geral.csv"
PARQUET = "data/historico_premio_geral.parquet"
PADRAO = "scripts/downloads/Pr*mioGeral-*.xlsx"
COLUNAS = ["Tribunal", "Artigo", "Alínea", "Requisito", "Resultado Referência", "Valor", "Resultado", "Pontuação"]

# 1) Arquivo gerado nesta execução (o mais recente da pasta de downloads)
arquivos = glob.glob(PADRAO)
if not arquivos:
    print("Nenhum PrêmioGeral encontrado em scripts/downloads; nada a registrar.")
    raise SystemExit(0)
arquivo = max(arquivos, key=os.path.getmtime)

m = re.search(r"-(\d{2})-(\d{2})-(\d{4})\.xlsx$", arquivo)
if not m:
    raise SystemExit(f"Nome de arquivo inesperado: {arquivo}")
data_arquivo = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

nova = pd.read_excel(arquivo, dtype=str)
faltando = [c for c in COLUNAS if c not in nova.columns]
if faltando:
    raise SystemExit(f"Colunas ausentes em {arquivo}: {faltando}")
nova = nova[COLUNAS]


def assinatura(df):
    """Hash do conteúdo da tabela, independente da ordem das linhas."""
    texto = df[COLUNAS].fillna("").astype(str).sort_values(COLUNAS).to_csv(index=False)
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


# 2) Compara com a última versão registrada
historico = pd.read_csv(CSV, dtype=str)
historico["snapshot_utc"] = historico["snapshot_utc"].fillna("")
ultima_data = historico["data_arquivo"].max()
da_ultima_data = historico[historico["data_arquivo"] == ultima_data]
ultimo_snap = da_ultima_data["snapshot_utc"].max()
ultima_versao = da_ultima_data[da_ultima_data["snapshot_utc"] == ultimo_snap]

if assinatura(nova) == assinatura(ultima_versao):
    print(f"Sem mudança em relação à última versão registrada ({ultima_data}); nada a registrar.")
    raise SystemExit(0)

# 3) Acrescenta a nova versão ao final do CSV
agora = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
nova.insert(0, "data_arquivo", data_arquivo)
nova.insert(1, "snapshot_utc", agora)
nova.insert(2, "run_id", os.environ.get("GITHUB_RUN_ID", ""))
nova.to_csv(CSV, mode="a", header=False, index=False, lineterminator="\n", encoding="utf-8")
print(f"Versão de {data_arquivo} registrada em {CSV}: {len(nova)} linhas.")

# 4) Mantém o parquet em dia (opcional)
try:
    completo = pd.read_csv(CSV)
    completo["run_id"] = completo["run_id"].astype("Int64")
    completo.to_parquet(PARQUET, index=False)
    print(f"{PARQUET} atualizado.")
except Exception as e:
    print(f"Parquet não atualizado ({e}); o CSV continua sendo a fonte.")
