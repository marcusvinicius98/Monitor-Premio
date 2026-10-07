"""
Gera o dashboard HTML (autocontido) a partir do histórico consolidado do PrêmioGeral.

Uso (a partir da raiz do repositório):
    python scripts/gerar_dashboard.py
    python scripts/gerar_dashboard.py data/historico_premio_geral.csv scripts/dashboard_template.html dashboard.html

Entrada : data/historico_premio_geral.csv (colunas: data_arquivo, Tribunal, Artigo, Alínea,
          Requisito, Resultado Referência, Valor, Resultado, Pontuação)
Saída   : dashboard.html (dados embutidos, abre em qualquer navegador)
"""
import json
import re
import sys

import pandas as pd

csv_path = sys.argv[1] if len(sys.argv) > 1 else "data/historico_premio_geral.csv"
template_path = sys.argv[2] if len(sys.argv) > 2 else "scripts/dashboard_template.html"
saida_path = sys.argv[3] if len(sys.argv) > 3 else "dashboard.html"

df = pd.read_csv(csv_path)

# Normaliza o texto do requisito (espaços) e unifica renomeações entre versões da tabela
df["Requisito"] = df["Requisito"].str.replace(r"\s+", " ", regex=True).str.strip()
df["Requisito"] = df["Requisito"].str.replace(r"VII -a\)", "VII - a)", regex=True)

# "III - e) Indicador VII" virou "III - f) Indicador VII" na versão de 03/10/2026
ALIAS = {"10) III - e) Indicador VII": "10) III - f) Indicador VII"}
for antigo, novo in ALIAS.items():
    junto = df[df["Requisito"].isin([antigo, novo])].groupby("data_arquivo")["Requisito"].nunique()
    assert (junto <= 1).all(), f"{antigo} e {novo} aparecem na mesma versão"
    df["Requisito"] = df["Requisito"].replace(antigo, novo)

datas = sorted(df["data_arquivo"].unique())
tribs = sorted(df["Tribunal"].unique())

ROMANOS = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8,
           "IX": 9, "X": 10, "XI": 11, "XII": 12, "XIII": 13, "XIV": 14, "XV": 15}

reqs_df = df.drop_duplicates("Requisito")[["Artigo", "Alínea", "Requisito"]].copy()
reqs_df["ord_ali"] = reqs_df["Alínea"].map(ROMANOS).fillna(99)
reqs_df = reqs_df.sort_values(["Artigo", "ord_ali", "Requisito"]).reset_index(drop=True)

reqs = []
idx_req = {}
for i, r in reqs_df.iterrows():
    idx_req[r["Requisito"]] = i
    txt = re.sub(r"^\d+\)\s*", "", r["Requisito"])
    reqs.append({"art": int(r["Artigo"]), "ali": r["Alínea"], "txt": txt})

idx_trib = {t: i for i, t in enumerate(tribs)}
idx_data = {d: i for i, d in enumerate(datas)}

S, T, R = len(datas), len(tribs), len(reqs)
val = [[None] * R for _ in range(S)]
ref = [[None] * R for _ in range(S)]
pts = [[[None] * R for _ in range(T)] for _ in range(S)]
res = [[[None] * R for _ in range(T)] for _ in range(S)]

for row in df.itertuples(index=False):
    s = idx_data[row.data_arquivo]
    t = idx_trib[row.Tribunal]
    r = idx_req[row.Requisito]
    val[s][r] = int(row.Valor)
    ref[s][r] = None if pd.isna(row._7) else str(row._7)
    pts[s][t][r] = int(row.Pontuação)
    res[s][t][r] = None if pd.isna(row.Resultado) else str(row.Resultado)

dados = {"datas": datas, "trib": tribs, "req": reqs, "val": val, "ref": ref, "pts": pts, "res": res}

with open(template_path, encoding="utf-8") as f:
    html = f.read()

html = html.replace("/*__DADOS__*/null", json.dumps(dados, ensure_ascii=False, separators=(",", ":")))

with open(saida_path, "w", encoding="utf-8") as f:
    f.write(html)

print(f"{S} versões, {T} tribunais, {R} requisitos -> {saida_path} ({len(html) // 1024} KB)")
