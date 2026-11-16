## Wada: original work and digitised data

Checked 7 November 2026. These tiles answer the request for combinations from
Sanzo Wada's *Haishoku Soukan*, known through Seigensha's *A Dictionary of Color
Combinations*. The [publisher's history](https://en.seigensha.com/books/978-4-86152-772-2/)
dates the original collection to 1933–1934; the
[National Diet Library catalogue](https://ndlsearch.ndl.go.jp/books/R100000039-I1191860)
also records a 1934 volume. We use numerical colour combinations only, with
original gallery layouts and descriptions. No reprint text, scans, illustrations
or printed plate layouts are included.

### Original copyright status (territorial)

The [Tokyo National Research Institute for Cultural Properties](https://www.tobunken.go.jp/materials/bukko/9183.html)
records Wada's death on 22 August 1967. Japan's Agency for Cultural Affairs
[extension FAQ, questions 2–4](https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/kantaiheiyo_chosakuken/1411890.html)
explains calendar-year calculation, the former life-plus-50 term, and that the
30 December 2018 extension to 70 years did not revive already expired rights.
Applying those rules to Wada's authored original work, its Japanese term ended
31 December 2017 and it entered the public domain in Japan on 1 January 2018.
This conclusion concerns the original work, not later editorial contributions.

That is not a worldwide public-domain claim. The US Copyright Office's
[URAA guidance](https://www.copyright.gov/circs/circ38b.pdf) explains that qualifying
foreign works may have restored US copyright for the remaining original term;
pre-1978 publications generally have a 95-year term. For a qualifying 1933–1934
publication that could run through 2028–2029. Publication and restoration details
for every original volume have not been established here. Other countries may
also apply different terms. The Office's
[Compendium, chapter 300, section 313.4(K)](https://www.copyright.gov/comp3/chap300/ch300-copyrightable-authorship.pdf)
distinguishes colour itself and systems matching colour sets from copyrightable
pictorial arrangements. The gallery reuses numeric sets and builds new interface
arrangements; it does not rely on a claim that the book is public domain worldwide.

### Dataset permission and provenance

The chosen dataset is **mattdesl/dictionary-of-colour-combinations**, revision
`c142bd0bc8049ea48db4da5eb397981f047e8ef4`. Its
[README](https://github.com/mattdesl/dictionary-of-colour-combinations/blob/c142bd0bc8049ea48db4da5eb397981f047e8ef4/README.md)
identifies 348 combinations, numbered 1–348, and 159 colour records; it explicitly
licenses the dataset under MIT. Its
[licence](https://github.com/mattdesl/dictionary-of-colour-combinations/blob/c142bd0bc8049ea48db4da5eb397981f047e8ef4/LICENSE.md)
permits copying, modification and redistribution with the copyright and permission
notice. The complete notice, copyright 2020 Matt DesLauriers, is preserved in
[licences/wada.txt](licences/wada.txt).

Credit: **Sanzo Wada**, original combinations; **Dain M. Blodorn Kim**, initial
digitisation; **Matt DesLauriers**, data corrections and CMYK-to-sRGB conversion.
The conversion uses U.S. Web Coated (SWOP) v2 to sRGB IEC61966-2.1 with relative
colorimetric rendering and black point compensation, according to the upstream
README. These are that dataset's screen approximations, not exact printed colours.
No data was taken from sanzo-wada.dmbk.io, and no separate licence is assumed for it.
MIT grants the dataset contributor's rights; it does not license a publisher's
reprint or supersede rights in underlying protected expression.

`collect-wada.mjs` fetches only pinned `colors.json` and `LICENSE.md`, verifies
the MIT notice, and keeps just hex values and combination membership in
`wada-data.json`. Colour names, CMYK/Lab metadata and imagery are omitted.
`sources.json` records SHA-256 digests of both the upstream bytes and the local
reduction. No network is used to build, view or check the gallery. The combination
number is the upstream identifier, not an inferred page number or array index.

### Selection and interface adaptation

There are 24 choices: twelve triples and twelve quadruples, eight per mood.
Mood labels are gallery judgements. The selected numbers are:

- Calm: **135, 139, 167, 178, 202, 281, 321, 330** — muted blue/green and pale yellow.
- Warm: **126, 166, 184, 190, 243, 263, 296, 342** — buff, salmon, brown and olive.
- Vivid: **134, 141, 154, 247, 265, 276, 295, 320** — purple, pink, orange and yellow.

Each set has a source colour with relative luminance below 0.08 or above 0.65,
suited to a dark or light canvas. Twelve studies are dark and twelve are light.
The top strip shows the exact three or four dataset colours in dataset order;
the second strip shows the interface roles, including derived colours.

`wada.mjs` assigns the darkest source colour to a dark canvas or the lightest to a
light canvas. In remaining dataset order, colours supply the note header tint,
action accent, then question highlight. A triple reuses its first remaining colour
as highlight; decision repeats the first header colour in every set. All source
colours participate, without changing their hex values. Headers use the shared
18% blend and the question uses the shared 13% blend described below.

The canvas is preserved. Frame/node layers blend it 6%/12% toward black for dark
studies or white for light studies. Text and state colours come from an original
achromatic scale: `#000000 / #171717 / #262626 / #404040 / #525252 / #737373 /
#a3a3a3 / #bdbdbd / #d4d4d4 / #e5e5e5 / #f5f5f5 / #fafafa / #ffffff`.
Primary text chooses the first value from the contrasting end that passes 4.5:1 on
every rendered text surface. Secondary text chooses the least contrasting value
that still passes 4.5:1 on all base layers. Dark states use `#a3a3a3 / #d4d4d4 /
#fafafa / #bdbdbd`; light states use `#525252 / #404040 / #171717 / #737373`.
These neutral states rely on labels for meaning; Wada supplied no interface state
semantics. Each tile explicitly notes its derived background layers and neutral
text/state colours, with exact values in the records below. The contrast mark
measures these adaptations and does not certify non-text accents or state meaning.
