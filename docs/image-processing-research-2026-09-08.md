# Upscaling und Freistellen für ImageStudio

Recherche und Implementierungsentscheidung vom 8. September 2026. Es wurden keine kostenpflichtigen Vergleichsgenerierungen ausgeführt. Die Empfehlung beruht auf aktuellen offiziellen Endpunkten, Schemas und Anbieterbeschreibungen; ein universeller Qualitätssieger mit großem Abstand ist damit nicht belegt.

## Auswahl

| Aufgabe | Gewähltes Modell | Warum | Listenpreis |
|---|---|---|---|
| Originalgetreu vergrößern | Topaz Precision | Dedizierte Restaurierung, mehrere Bildtypen, ohne Erhaltungsprompt | 0,08 USD je angefangene 24 MP Ausgabe |
| Transparente PNGs/Logos vergrößern | Topaz Transparent | Expliziter Erhalt des Alphakanals; fest 4× | 0,08 USD je angefangene 24 MP Ausgabe |
| Motiv freistellen | BRIA RMBG 2.0 | Einfache, spezialisierte Freistellung als transparentes PNG | 0,018 USD/Bild |

Quellen: [Precision](https://fal.ai/models/topaz/upscale/image/precision), [Transparent](https://fal.ai/models/topaz/upscale/image/transparent), [BRIA](https://fal.ai/models/fal-ai/bria/background/remove).

ImageStudio verwendet für Precision standardmäßig High Fidelity V3 und 2×. Das ist unsere Auswahl für Creator-Fotos; der Provider-Standard ist Standard V2. Standard V2, High Fidelity V2, Low Resolution V2, CGI und Text Refine bleiben ebenfalls wählbar. Wer ein Bild rekonstruiert statt originalgetreu vergrößert, könnte mit generativen Varianten bessere subjektive Details bekommen. Das ist jedoch nicht dasselbe wie das Original zu erhalten.

## Unterstützte Optionen

[Das aktuelle Precision-Schema](https://fal.ai/models/topaz/upscale/image/precision/api) unterstützt Faktor 1–4, Bildtyp, PNG/JPEG, crop-to-fill, Motiverkennung, Gesichtsverbesserung samt Stärke/Kreativität, Schärfen, Entrauschen, Kompressionskorrektur und Textstärke. ImageStudio bietet diese Optionen in UI und MCP aus derselben Registry an. CGI unterstützt keine Kompressionskorrektur; Textstärke ist nur für Text Refine gültig. Optionale leere Werte überlassen die Entscheidung dem Modell.

[Transparent](https://fal.ai/models/topaz/upscale/image/transparent/api) hat keine frei wählbaren Restaurierungsparameter und keinen Skalierungsparameter: Es arbeitet immer mit 4× und PNG. Einen Faktor 2× für dieses Modell anzubieten wäre falsch. Ein normales PNG-Ausgabeformat allein garantiert keinen erhaltenen Alphakanal; ImageStudio prüft tatsächliche transparente Pixel und wählt hierfür automatisch Transparent.

[BRIA](https://fal.ai/models/fal-ai/bria/background/remove/api) braucht nur das Quellbild. Es gibt keine sinnvollen Prompt- oder erfundenen Qualitätsregler. Die Queue bleibt asynchron, damit Jobs und Provider-Request-IDs verfügbar sind.

## Große Dateien und wiederholtes Upscaling

Es gibt keine zusätzliche ImageStudio-Grenze bei 4K, 100 MP oder nach einer bestimmten Anzahl von Durchläufen. Jeder Durchlauf verwendet die tatsächlichen Abmessungen der ausgewählten Originaldatei. Beispiel: Ein 1024²-Bild kann über Transparent zu 4096² und anschließend zu 16384² werden; jeder Durchlauf ist ein eigener kostenpflichtiger Auftrag.

fal veröffentlicht in diesen Endpunktschemas die Faktoren pro Durchlauf, aber keine verbindliche pauschale Pixelobergrenze. Daraus folgt keine Garantie unendlicher Größe: Anbieter-, Speicher- oder Formatgrenzen können weiterhin eine Verarbeitung verhindern. Topaz nennt für seine eigene direkte [Standard-V2-API](https://developer.topazlabs.com/image-models/gigapixel/standard-2) 512 MP Eingabe und 1024 MP Ausgabe. Diese Angabe darf nicht ungeprüft als exakte fal-Grenze für alle Varianten übernommen werden. Desktop-Gigapixel-Grenzen sind ebenfalls keine fal-API-Spezifikation.

Damit der Browser nicht zum künstlichen Engpass wird, prüft ImageStudio Quelldateien nativ mit Sharp und lädt die vollständige Datei über einen dateibasierten Blob hoch. Fertige Ergebnisse werden unverändert auf die Festplatte gestreamt. Große Bilder bekommen eine separate verkleinerte Anzeigevorschau; erneutes Upscaling und Export verwenden die Originaldatei. PNG bleibt unverändert PNG; bei expliziter JPEG-Wahl wird das Provider-JPEG ohne weitere verlustbehaftete Nachbearbeitung gespeichert. Der Anti-Detection-Resamplingpfad läuft nicht über diese Ergebnisse.

## Auflösung bei BRIA

Die fal-Produktbeschreibung nennt bis zu 1024×1024 und zugleich den Erhalt der Eingabemaße; das API-Schema nennt keine entsprechende Eingabegrenze. Die offizielle [BRIA-Modellkarte](https://huggingface.co/briaai/RMBG-2.0/blob/main/README.md) zeigt, wie intern mit 1024² segmentiert und die Maske anschließend auf die Originalgröße zurückskaliert wird. 1024² ist deshalb kein belegtes generelles Ausgabelimit. Die konkrete fal-Implementierung ist damit nicht vollständig offengelegt. ImageStudio übergibt die Originaldatei und erfasst die tatsächlichen Ergebnismaße.

## Geprüfte Alternativen

- [Topaz Wonder 3.5 / Generative](https://fal.ai/models/topaz/upscale/image/generative/api): aktuelle Rekonstruktion feiner Details, 0,08 USD je angefangene 8 MP. Generierte Details können von der Quelle abweichen; daher kein stiller Ersatz für originalgetreues Upscaling von Gesichtern, Text oder Logos.
- [SeedVR2](https://fal.ai/models/fal-ai/seedvr/upscale/image/api): starke Upscale-Alternative. Der [fal-Vergleich](https://blog.fal.ai/comparing-the-best-ai-upscalers-for-video-and-images/) zeigt motivabhängige Unterschiede und belegt keinen pauschalen aktuellen Gewinner.
- [BiRefNet v2](https://fal.ai/models/fal-ai/birefnet/v2/api): zusätzliche Matting-/Portrait-Modelle und höhere interne Auflösung machen es für schwierige Haare interessant. Kein belegter pauschaler Qualitätssieg über BRIA; öffentlich gerundete compute-second-Preise erlauben keinen seriösen festen Pro-Bild-Preis.
- [Ideogram Remove Background](https://fal.ai/models/fal-ai/ideogram/remove-background/api): einfache Alternative für 0,01 USD/Bild, ohne belegten generellen Qualitätsvorsprung.

## Verifikation

Provider-Aufrufe sind in den Tests gemockt. Geprüft werden Endpunkt und tatsächliche Parameter, Originalbytes beim Upload, PNG/JPEG-Ausgabe, Alphakanal, Kostenstaffeln, Fehler, Abbruch, wiederholte Durchläufe, native Speicherung oberhalb einer Browser-Kantenlänge, getrennte Vorschauen und Originalexport. Die Electron-Suite prüft UI und MCP gegen dieselbe Galerie. Die Tests prüfen die Integration und Datenintegrität; sie ersetzen keinen visuellen Vergleich echter Provider-Ergebnisse.
