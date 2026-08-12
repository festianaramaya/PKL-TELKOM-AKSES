#!/usr/bin/env bash
# ============================================================================
# upload-reference.sh
# Upload / update file acuan (referensi cable sheath) lewat terminal.
#
# Pemakaian:
#   ./scripts/upload-reference.sh <path-file.csv-atau-xlsx> [base-url]
#
# Contoh:
#   ./scripts/upload-reference.sh ./DISTRIBUSI_CABLE_SHEATH_2026-07-30.csv
#   ./scripts/upload-reference.sh ./data.csv http://localhost:4000
# ============================================================================
set -euo pipefail

FILE="${1:-}"
BASE_URL="${2:-http://localhost:3000}"

if [ -z "$FILE" ]; then
  echo "Pemakaian: $0 <path-file.csv-atau-xlsx> [base-url]"
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "❌ File tidak ditemukan: $FILE"
  exit 1
fi

SIZE_HUMAN=$(du -h "$FILE" | cut -f1)
echo "→ Mengupload '$FILE' ($SIZE_HUMAN) ke ${BASE_URL}/api/reference/upload ..."

START=$(date +%s)

HTTP_CODE=$(curl -sS -o /tmp/ref_upload_response.json -w "%{http_code}" \
  -X POST "${BASE_URL}/api/reference/upload" \
  -F "referenceFile=@${FILE}")

END=$(date +%s)
ELAPSED=$((END - START))

RESPONSE=$(cat /tmp/ref_upload_response.json)
rm -f /tmp/ref_upload_response.json

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "✅ Berhasil (${ELAPSED}s):"
else
  echo "❌ Gagal (HTTP $HTTP_CODE, ${ELAPSED}s):"
fi

# Pretty-print JSON pakai node (sudah pasti ada karena ini project Node)
echo "$RESPONSE" | node -e "
  let raw = '';
  process.stdin.on('data', d => raw += d);
  process.stdin.on('end', () => {
    try {
      const d = JSON.parse(raw);
      console.log(d.message || raw);
      if (d.stats) console.log(JSON.stringify(d.stats, null, 2));
    } catch (e) {
      console.log(raw);
    }
  });
"

if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
  exit 1
fi
