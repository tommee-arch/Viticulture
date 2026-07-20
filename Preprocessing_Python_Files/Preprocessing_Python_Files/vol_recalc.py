r"""
Update the existing Litres and Volume_m3 fields in each JSON record from the
Irrigation_net mean:

    Litres    = Irrigation_net * Area_m2
    Volume_m3 = Irrigation_net * Area_m2 / 1000   (= Litres / 1000)

No new attributes are created - only Litres and Volume_m3 are overwritten.
Records missing Irrigation_net or Area_m2 (or where either is null) get null
in both fields.

Requires: nothing beyond the standard library.
"""

import json

# ----------------------------- CONFIG ---------------------------------------
INPUT_JSON  = r"D:\Hackathon\Hackathon\Output\Final\Full_final_irrigation.json"
OUTPUT_JSON = r"D:\Hackathon\Hackathon\Output\Final\Full_final_volume.json"

IRRIGATION_FIELD = "Irrigation_net"
AREA_FIELD       = "Area_m2"
LITRES_FIELD     = "Litres"
VOLUME_FIELD     = "Volume_m3"

ROUND_LITRES = 2
ROUND_VOLUME = 4
# -----------------------------------------------------------------------------


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data, data
    for value in data.values():
        if isinstance(value, list):
            return data, value
    raise ValueError("JSON does not contain a list of records.")


def main():
    root, records = load_json(INPUT_JSON)

    stats = {"total": 0, "updated": 0, "nulled": 0}

    for rec in records:
        stats["total"] += 1
        irr = rec.get(IRRIGATION_FIELD)
        area = rec.get(AREA_FIELD)

        if irr is None or area is None:
            rec[LITRES_FIELD] = None
            rec[VOLUME_FIELD] = None
            stats["nulled"] += 1
            continue

        litres = float(irr) * float(area)
        rec[LITRES_FIELD] = round(litres, ROUND_LITRES)
        rec[VOLUME_FIELD] = round(litres / 1000.0, ROUND_VOLUME)
        stats["updated"] += 1

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(root, f, indent=2, ensure_ascii=False)

    print("=" * 55)
    print("Volume / Litres UPDATE REPORT")
    print("=" * 55)
    print(f"Total records:                       {stats['total']}")
    print(f"Records updated:                     {stats['updated']}")
    print(f"Records set to null (missing input): {stats['nulled']}")
    print(f"\nSaved: {OUTPUT_JSON}")


if __name__ == "__main__":
    main()