"""Patch routes.py using line numbers."""
path = r"C:\Proj_T\meta-guard\backend\routes.py"

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Find the start line (contains "Use STORED similarity score")
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if "Use STORED similarity score as the authoritative score" in line:
        start_idx = i
    if start_idx is not None and '"match_statistics": comparison_data.get("match_statistics", {})' in line:
        # This is the last line of the return dict
        # The closing brace } is on the next line
        end_idx = i + 2  # include the closing } line
        break

print(f"start_idx={start_idx}, end_idx={end_idx}")
if start_idx:
    print(f"  Line {start_idx+1}: {lines[start_idx].rstrip()}")
if end_idx:
    print(f"  Line {end_idx}: {lines[end_idx-1].rstrip()}")
    print(f"  Line {end_idx+1}: {lines[end_idx].rstrip() if end_idx < len(lines) else 'EOF'}")
