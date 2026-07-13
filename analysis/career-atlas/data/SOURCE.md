# Natural Earth 110m land provenance

`ne_110m_land.geojson` is the Natural Earth 1:110m land layer, vendored from
the project’s maintained vector repository at commit
`ca96624a56bd078437bca8184e78163e5039ad19`:

- Source file: https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_110m_land.geojson
- Official 110m land download page: https://www.naturalearthdata.com/downloads/110m-physical-vectors/
- Terms: https://www.naturalearthdata.com/about/terms-of-use/
- Vendored SHA-256: `9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9`

Natural Earth states that all raster and vector map data on its site are in
the public domain. The source geometry remains unmodified in `data/`; the
career crop, projection, clipping, rounding, and simplification are generated
deterministically into `../output/atlas.json`.
