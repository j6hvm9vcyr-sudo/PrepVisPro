#!/bin/sh
# Animatique : écrit des timelines d'exemple puis les fait relire par les outils de référence.
# Prérequis : pip install opentimelineio otio-fcpx-xml-adapter ; xmllint.
# La DTD FCPXML 1.9 (© Apple, livrée avec Final Cut Pro) est reprise du dépôt CommandPost.
set -e
OUT=$(mktemp -d)
DTD="$OUT/FCPXMLv1_9.dtd"
git clone -q --depth 1 --filter=blob:none --no-checkout https://github.com/CommandPost/CommandPost "$OUT/cp"
git -C "$OUT/cp" checkout -q HEAD -- src/extensions/cp/apple/fcpxml/dtd/FCPXMLv1_9.dtd
cp "$OUT/cp/src/extensions/cp/apple/fcpxml/dtd/FCPXMLv1_9.dtd" "$DTD"
ANIMATIC_OUT="$OUT" npx vitest run src/model/animatic.test.ts > /dev/null
for f in "$OUT"/*.fcpxml; do xmllint --noout --dtdvalid "$DTD" "$f" && echo "$(basename "$f") : conforme à la DTD FCPXML 1.9"; done
python3 -I scripts/check_animatique.py "$OUT"
rm -rf "$OUT"
