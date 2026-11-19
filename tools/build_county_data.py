import json
import math
import sys
from pathlib import Path

import pandas as pd
import pyreadr

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "counties.json"
TOPO = ROOT / "data" / "geo" / "counties.topojson"

LEGACY_YEARS = [2000, 2004, 2008, 2012, 2016, 2020]


def main(rdata_path):
    result = pyreadr.read_r(rdata_path)
    df = next(iter(result.values()))
    df = df[df["fips"].notna()].copy()
    df["election_year"] = df["election_year"].astype(int)

    old = json.loads(OUT.read_text()) if OUT.exists() else {"counties": [], "years": []}
    legacy = {c["f"]: c for c in old["counties"]}
    topo = json.loads(TOPO.read_text())
    map_fips = {str(g["id"]).zfill(5) for g in topo["objects"]["counties"]["geometries"]}

    years = sorted(df["election_year"].unique().tolist())
    index = {y: i for i, y in enumerate(years)}

    data = {}
    for row in df.itertuples(index=False):
        f = row.fips
        if f not in map_fips or math.isnan(row.democratic_raw_votes) or math.isnan(row.republican_raw_votes):
            continue
        dem, rep = int(row.democratic_raw_votes), int(row.republican_raw_votes)
        total = row.raw_county_vote_totals
        total = int(total) if not math.isnan(total) else dem + rep
        total = max(total, dem + rep)
        if total <= 0:
            continue
        entry = data.setdefault(f, {"d": [None] * len(years), "r": [None] * len(years), "t": [None] * len(years)})
        i = index[row.election_year]
        entry["d"][i] = (entry["d"][i] or 0) + dem
        entry["r"][i] = (entry["r"][i] or 0) + rep
        entry["t"][i] = (entry["t"][i] or 0) + total

    carried = 0
    for f in sorted(map_fips - set(data)):
        c = legacy.get(f)
        if not c or not c.get("h"):
            continue
        entry = {"d": [None] * len(years), "r": [None] * len(years), "t": [None] * len(years)}
        for y, share in zip(old["years"], c["h"]):
            if share and y in LEGACY_YEARS and y in index:
                i = index[y]
                entry["d"][i] = round(share[0] / 1000 * c["t"])
                entry["r"][i] = round(share[1] / 1000 * c["t"])
                entry["t"][i] = c["t"]
        data[f] = entry
        carried += 1

    counties = []
    for f in sorted(map_fips):
        base = legacy.get(f)
        if not base:
            print("warning: no static attributes for", f)
            continue
        e = data.get(f)
        if not e:
            print("warning: no election data for", f, base["n"], base["s"])
            e = {"d": [None] * len(years), "r": [None] * len(years), "t": [None] * len(years)}
        counties.append({
            "f": f, "s": base["s"], "n": base["n"], "c": base["c"], "ru": base["ru"], "p": base["p"],
            "d": e["d"], "r": e["r"], "t": e["t"],
        })

    OUT.write_text(json.dumps({"years": years, "counties": counties}, separators=(",", ":")))
    print(f"wrote {OUT} - {len(counties)} counties, {len(years)} elections ({years[0]}-{years[-1]}), "
          f"{carried} counties carried over from the previous file")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python3 tools/build_county_data.py path/to/file.Rdata")
    main(sys.argv[1])
