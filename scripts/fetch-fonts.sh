#!/usr/bin/env bash
# Докачивает красивые книжные шрифты (лицензия OFL/Apache) с кириллицей.
# Если какой-то не скачается — приложение просто не покажет его в списке.
set -u
D="app/src/main/assets/web/fonts/extra"
mkdir -p "$D"
G="https://raw.githubusercontent.com/google/fonts/main"
get() {
  if curl -fsSL --retry 3 --max-time 60 -o "$D/$2" "$G/$1"; then echo "ok   $2"; else echo "skip $2"; rm -f "$D/$2"; fi
}
get "ofl/literata/Literata%5Bopsz,wght%5D.ttf"                Literata.ttf
get "ofl/literata/Literata-Italic%5Bopsz,wght%5D.ttf"         Literata-Italic.ttf
get "ofl/ptserif/PT_Serif-Web-Regular.ttf"                    PTSerif-Regular.ttf
get "ofl/ptserif/PT_Serif-Web-Bold.ttf"                       PTSerif-Bold.ttf
get "ofl/ptserif/PT_Serif-Web-Italic.ttf"                     PTSerif-Italic.ttf
get "ofl/ptserif/PT_Serif-Web-BoldItalic.ttf"                 PTSerif-BoldItalic.ttf
get "ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf"                 EBGaramond.ttf
get "ofl/ebgaramond/EBGaramond-Italic%5Bwght%5D.ttf"          EBGaramond-Italic.ttf
get "ofl/alegreya/Alegreya%5Bwght%5D.ttf"                     Alegreya.ttf
get "ofl/alegreya/Alegreya-Italic%5Bwght%5D.ttf"              Alegreya-Italic.ttf
get "ofl/sourceserif4/SourceSerif4%5Bopsz,wght%5D.ttf"        SourceSerif4.ttf
get "ofl/sourceserif4/SourceSerif4-Italic%5Bopsz,wght%5D.ttf" SourceSerif4-Italic.ttf
get "ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf"   CormorantGaramond.ttf
get "ofl/cormorantgaramond/CormorantGaramond-Italic%5Bwght%5D.ttf" CormorantGaramond-Italic.ttf
get "ofl/ptsans/PT_Sans-Web-Regular.ttf"                      PTSans-Regular.ttf
get "ofl/ptsans/PT_Sans-Web-Bold.ttf"                         PTSans-Bold.ttf
get "ofl/ptsans/PT_Sans-Web-Italic.ttf"                       PTSans-Italic.ttf
get "ofl/ptsans/PT_Sans-Web-BoldItalic.ttf"                   PTSans-BoldItalic.ttf
get "ofl/montserrat/Montserrat%5Bwght%5D.ttf"                 Montserrat.ttf
get "ofl/montserrat/Montserrat-Italic%5Bwght%5D.ttf"          Montserrat-Italic.ttf
get "ofl/comfortaa/Comfortaa%5Bwght%5D.ttf"                   Comfortaa.ttf
get "apache/robotoslab/RobotoSlab%5Bwght%5D.ttf"              RobotoSlab.ttf
# список того, что реально скачалось — его читает приложение
( cd "$D" && ls -1 *.ttf 2>/dev/null | python3 -c 'import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))' > manifest.json )
cat "$D/manifest.json"
