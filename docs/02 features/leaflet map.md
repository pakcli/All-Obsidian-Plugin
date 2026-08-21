---
title: "Leaflet Map"
---

# Feature: Leaflet Map

**Leaflet Map** brings interactive, zoomable geospatial mapping and custom image-based world maps into your [[obsidian|Obsidian]] notes.

---

## 🗺️ Key Capabilities

- **Interactive Maps**: Pan, zoom, and explore global OpenStreetMap layers directly in notes using [[multi layer map rendering|multi-layer map rendering]].
- **Custom Image Maps (Fantasy / Worldbuilding)**: Use high-resolution fictional game/world images as zoomable grid maps with custom [[coordinates|coordinates]].
- **Markers & Pins**: Drop custom [[pins|pins]], colored markers, and icons linked directly to internal vault notes via [[wiki|wikilinks]] (`[[Citadel]]`).
- **GeoJSON & GPX Layers**: Import and visualize track routes, boundaries, and regional polygon overlays with [[geojson layers|GeoJSON layers]].

---

## 📝 Syntax Example

````markdown
```leaflet
id: world-map
image: [[Map.jpg]]
height: 500px
minZoom: 1
maxZoom: 5
defaultZoom: 2
coordinates: [50, 50]
marker: [52.1, 48.3, [[The Grand Citadel]], "The Grand Citadel", "castle-icon"]
```
````

---

## ⚙️ Configuration (Settings → PakCLI Suite → Leaflet Map)

- **Default Map Height & Zoom**: Set initial viewport defaults and [[coordinates|coordinates]].
- **Marker Icon Presets**: Define custom SVG and image icons for [[pins|points of interest]].
- **Tile Server Provider**: Configure custom OpenStreetMap or Mapbox tile URLs for [[multi layer map rendering|multi-layer map rendering]].
