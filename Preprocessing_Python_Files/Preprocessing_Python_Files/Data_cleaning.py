import json
import pandas as pd
import os

# ==========================================================
# 1. SETUP PATHS
# ==========================================================
input_folder = r"C:\Users\28365798\OneDrive\OneDrive - Stellenbosch University\Documents\tokara-hackathon\Output"

files_to_clean = [
    "Tokara_Daily_V_ETa.json",
    "Tokara_Daily_V_Required.json"
]

for filename in files_to_clean:
    file_path = os.path.join(input_folder, filename)
    
    if not os.path.exists(file_path):
        print(f"Skipping {filename}: File not found.")
        continue
        
    print(f"Loading {filename}...")
    
    # ==========================================================
    # 2. EXTRACT NON-SPATIAL DATA
    # ==========================================================
    # We load the JSON and extract only the 'properties' dictionary from each feature.
    # This automatically drops 'geometry', 'type', and the 'features' wrapper.
    with open(file_path, "r") as f:
        data = json.load(f)
        
    records = [feature["properties"] for feature in data["features"]]
    
    # ==========================================================
    # 3. CLEAN DATAFRAME & DROP DUPLICATES
    # ==========================================================
    df = pd.DataFrame(records)
    
    original_count = len(df)
    
    # Drop duplicates where the same block has the same date
    # 'keep="last"' ensures that if there is a duplicate, the most recent calculation is kept
    df = df.drop_duplicates(subset=["BLOCK", "Date"], keep="last")
    
    new_count = len(df)
    print(f"Cleaned {filename}: Removed {original_count - new_count} duplicate records.")
    
    # ==========================================================
    # 4. EXPORT FLAT FILES
    # ==========================================================
    # Export as CSV (Highly recommended for PowerBI / Dashboards due to small size)
    csv_out = os.path.join(input_folder, filename.replace(".json", "_Cleaned.csv"))
    df.to_csv(csv_out, index=False)
    
    # Export as Flat JSON (Standard JSON without the GeoJSON spatial overhead)
    json_out = os.path.join(input_folder, filename.replace(".json", "_Cleaned.json"))
    df.to_json(json_out, orient="records", indent=4)
    
    print(f"Saved to CSV: {csv_out}")
    print(f"Saved to JSON: {json_out}\n")

print("All cleaning operations completed successfully.")