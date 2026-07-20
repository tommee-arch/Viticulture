r"""
Remove records that are EXACT duplicates (every attribute identical), keeping
the first occurrence and preserving order. Two records match even if their
keys appear in a different order.

Prints how many duplicates were found and removed.

Requires: nothing beyond the standard library.
"""

import json

# ----------------------------- CONFIG ---------------------------------------
INPUT_JSON  = r"D:\Hackathon\Hackathon\Output\Final\Full_final_volume.json"
OUTPUT_JSON = r"D:\Hackathon\Hackathon\Output\Final\Full_final_deduped_v2.json"
# -----------------------------------------------------------------------------


def load_json(path):
    """Return (root, records, kind). 'root' is what gets written back out."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data, data, "array"
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, list):
                return data, value, ("dict", key)
    raise ValueError("JSON does not contain a list of records.")


def main():
    root, records, kind = load_json(INPUT_JSON)

    seen = set()
    unique = []
    for rec in records:
        # sort_keys makes identical records match regardless of key order
        signature = json.dumps(rec, sort_keys=True, ensure_ascii=False)
        if signature not in seen:
            seen.add(signature)
            unique.append(rec)

    removed = len(records) - len(unique)

    if isinstance(kind, tuple):      # records lived under a dict key
        root[kind[1]] = unique
        output = root
    else:
        output = unique

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print("=" * 55)
    print("EXACT DUPLICATE REMOVAL REPORT")
    print("=" * 55)
    print(f"Original records:   {len(records)}")
    print(f"Unique records:     {len(unique)}")
    print(f"Duplicates removed: {removed}")
    print(f"\nSaved: {OUTPUT_JSON}")


if __name__ == "__main__":
    main()