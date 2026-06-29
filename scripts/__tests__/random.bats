bats_load_library 'helper'

setup() {
  bats_tmp_dir
  SCRIPT_DIR="$(cd "$(dirname "${BATS_TEST_FILENAME}")/.." && pwd)"
}

teardown() {
  bats_cleanup
}

# Write a curl mock that handles both Scryfall and mtgpics calls
_mock_curl_success() {
  curl() {
    local outfile=""
    local i=1
    while [[ $i -le $# ]]; do
      [[ "${*[$i]}" == "-o" || "${*[$i]}" == "--output" ]] && outfile="${*[$((i+1))]}"
      i=$((i+1))
    done
    if [[ "$*" == *"api.scryfall.com"* ]]; then
      echo '{"name":"Test Card","set":"dft","collector_number":"42","image_uris":{"art_crop":"https://cards.scryfall.io/art_crop/front/test.jpg"}}' > "$outfile"
      return 0
    fi
    if [[ "$*" == *"mtgpics.com"* ]]; then
      echo "$*" >> "$BATS_TMP_DIR/calls.txt"
      printf '%01000d' 0 > "$outfile"
      return 0
    fi
  }
  better-cat() { echo "DISPLAYED:$1"; }
  bats_mock curl better-cat
}

@test "downloads art from mtgpics using scryfall card data" {
  _mock_curl_success
  bats_run_zsh "${SCRIPT_DIR}/random"
  [[ "$status" -eq 0 ]]
}

@test "displays card name and set" {
  _mock_curl_success
  bats_run_zsh "${SCRIPT_DIR}/random"
  [[ "$output" == *"Test Card"* ]]
  [[ "$output" == *"dft"* ]]
}

@test "calls mtgpics with zero-padded collector number" {
  _mock_curl_success
  bats_run_zsh "${SCRIPT_DIR}/random"
  local calls="$(cat "$BATS_TMP_DIR/calls.txt")"
  [[ "$calls" == *"pics/art/dft/042.jpg"* ]]
}

@test "falls back to scryfall art_crop if mtgpics fails" {
  curl() {
    local outfile=""
    local i=1
    while [[ $i -le $# ]]; do
      [[ "${*[$i]}" == "-o" || "${*[$i]}" == "--output" ]] && outfile="${*[$((i+1))]}"
      i=$((i+1))
    done
    if [[ "$*" == *"api.scryfall.com"* ]]; then
      echo '{"name":"Test Card","set":"dft","collector_number":"42","image_uris":{"art_crop":"https://cards.scryfall.io/art_crop/front/test.jpg"}}' > "$outfile"
      return 0
    fi
    if [[ "$*" == *"mtgpics.com"* ]]; then
      echo "" > "$outfile"
      return 0
    fi
    if [[ "$*" == *"scryfall.io"* ]]; then
      printf '%01000d' 0 > "$outfile"
      return 0
    fi
  }
  better-cat() { echo "DISPLAYED:$1"; }
  bats_mock curl better-cat

  bats_run_zsh "${SCRIPT_DIR}/random"
  [[ "$status" -eq 0 ]]
  [[ "$output" == *"falling back"* ]]
}
