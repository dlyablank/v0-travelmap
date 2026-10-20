# Demo assets

- `karelia.jpg`: regional photograph from the Russian Travel educational asset set, retained from https://github.com/dacorm/russian-travel/blob/main/images/place-karelia.jpg (source may use master). It depicts Karelia in general, not each named stop. It is not a video, and no recorded visit to individual locations is implied. The original educational source does not identify the photographer or grant a separate production license; replace with your own licensed location-specific imagery before public commercial distribution.
- `fallback.svg`: original landscape illustration made for this application. Used whenever media cannot load.
- Seven open travel videos are bundled in `videos/`; see below. YouTube uses the official privacy-enhanced embed, with an original-source link. TikTok and Instagram use original-source links.
- Inter: Rasmus Andersson, SIL Open Font License; see `/fonts/OFL.txt`.
- Geographic data: Natural Earth, public domain. Source: https://github.com/nvkelso/natural-earth-vector, 50m land and 10m lakes, filtered to the region. These are overview polygons, not navigational road data.

## Short map videos (verified 2026-10-20)

Five additional clips (all **CC BY-SA 4.0**, including derived MP4s, muted previews and JPG posters):

| Local basename | Work / source | Author | Geographic placement |
| --- | --- | --- | --- |
| `kivach` | [Кондопожский р-н, вдп Кивач зимой](https://commons.wikimedia.org/w/index.php?curid=114966475) | Avsolov | Existing Kivach landmark, 62.268, 33.9814; winter footage from 2022-01-30 |
| `suisaari` | [Suisaari](https://commons.wikimedia.org/w/index.php?curid=112508381) | 基日島 | Source camera coordinates 61.9845, 34.5596 |
| `syskyanjoki` | [Aerial view of Syskyänjoki](https://commons.wikimedia.org/w/index.php?curid=112925980) | 基日島 | Source camera coordinates 61.6639, 31.2731 |
| `iijoki` | [Aerial view of Iijoki near Kontiovaarankoski](https://commons.wikimedia.org/w/index.php?curid=112926368) | 基日島 | Source camera coordinates 61.4662, 30.0537 |
| `ruskeala-train` | [Заезд Л 2180 на поворотный круг](https://commons.wikimedia.org/w/index.php?curid=134643586) | Avsolov | Source camera coordinates 61.951578, 30.572754; separate railway-platform stop, not marble-canyon footage |

[License: CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Changes: excerpts of up to 15 seconds (start at 0 seconds, except train at 8 seconds), resized and transcoded from Wikimedia 480p VP9 derivatives to H.264/AAC MP4 with faststart. `-preview.mp4`: first up to 8 seconds, 240p, no audio. `.jpg`: frame at 1 second. CSS crops previews into portrait tiles; main card displays the same source. UI author/source/license links and excerpt/crop notice accompany each clip. No endorsement is implied. Exact source/download URLs, dates, authors and transformation details are recorded in [videos/SOURCES.json](videos/SOURCES.json). Coordinates identify footage/landmarks, not guaranteed access, parking or a safe landing.

- `videos/kizhi.webm`: **Chimes of Kizhi 2022**, Андрей Крижановский / Andrew Krizhanovsky (AKA MBG), 2022-08-19. [Source and public-domain release](https://commons.wikimedia.org/wiki/File:Chimes_of_Kizhi_2022.webm). Downloaded Wikimedia 480p VP9 derivative, 12.019 seconds. Depicts the bell tower on Kizhi island; not footage of every stop.
- `videos/koirinoja.webm`: **Unterer Koyrinoja-Wasserfall**, Gesellschaftlichnützlichearbeit, 2022-11-12. [Source](https://commons.wikimedia.org/wiki/File:Unterer_Koyrinoja-Wasserfall.ogg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Downloaded Wikimedia 480p VP9 derivative, 16.85 seconds. Camera coordinates from source: 61.638276, 31.410226. Corresponding new stop: Нижний водопад Койриноя.
- The `.webm` files retain their source licenses, independently of the application code. No editorial cuts; Wikimedia transcodes reduce resolution. Matching `.jpg` posters are frames extracted at 1 second; posters and CSS-cropped previews retain the same respective license (Public domain / CC BY-SA 4.0). The UI links the author, source and license from the place card. Cropping is disclosed there. No endorsement is implied.
- To reproduce downloads, use Commons `action=query&prop=videoinfo&viprop=url|derivatives|extmetadata` for the two source titles and select `480p.vp9.webm`. Original files remain available on their source pages.
