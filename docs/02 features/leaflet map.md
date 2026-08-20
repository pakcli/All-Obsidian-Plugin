---
title: "Leaflet Map"
---

# Feature: Leaflet Map

**Leaflet Map** brings interactive, zoomable geospatial mapping and custom image-based world maps into your Obsidian notes.

---

## 🗺️ Key Capabilities

- **Interactive Maps**: Pan, zoom, and explore global OpenStreetMap layers directly in notes.
- **Custom Image Maps (Fantasy / Worldbuilding)**: Use high-resolution fictional game/world images as zoomable grid maps.
- **Markers & Pins**: Drop custom pins, colored markers, and icons linked directly to internal vault notes (`[[Location Note]]`).
- **GeoJSON & GPX Layers**: Import and visualize track routes, boundaries, and regional polygon overlays.

---

## 📝 Syntax Example

````markdown
```leaflet
id: world-map
image: [[assets/world_map.png]]
height: 500px
minZoom: 1
maxZoom: 5
defaultZoom: 2
coordinates: [50, 50]
marker: [52.1, 48.3, [[Capital City]], "The Grand Citadel", "castle-icon"]
```
````

---

## ⚙️ Configuration (Settings → PakCLI Suite → Leaflet Map)

- **Default Map Height & Zoom**: Set initial viewport defaults.
- **Marker Icon Presets**: Define custom SVG and image icons for points of interest.
- **Tile Server Provider**: Configure custom OpenStreetMap or Mapbox tile URLs.
