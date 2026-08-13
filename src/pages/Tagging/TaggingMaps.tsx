import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MainLayout from "../../components/MainLayout";
import "../../assets/Tagging/TaggingMaps.css";

export interface TaggingMarkerData {
  id: string;
  lat: number;
  lng: number;
  type: string;
  label?: string;
  keterangan?: string;
}

const TaggingMaps: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Ambil marker lama & status tagging dari state navigasi
  const initialMarkers: TaggingMarkerData[] = location.state?.existingMarkers || [];
  const initialIsTagging: boolean = location.state?.isTagging ?? false;

  const [isTagging, setIsTagging] = useState<boolean>(initialIsTagging);
  const [markers, setMarkers] = useState<TaggingMarkerData[]>(initialMarkers);

  // 1. MENERIMA MARKER BARU DARI FORM
  useEffect(() => {
    if (location.state?.newMarker) {
      const newMarker = location.state.newMarker as TaggingMarkerData;
      
      setMarkers((prev) => {
        // Mencegah penambahan duplikat berdasarkan ID
        if (prev.some((m) => m.id === newMarker.id)) return prev;
        return [...prev, newMarker];
      });

      setIsTagging(true); // Pastikan sesi START tetap aktif

      // Hapus state navigasi sementara agar tidak dobel saat refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // 2. INISIALISASI PETA LEAFLET
  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMapRef.current) {
      const map = L.map(mapRef.current, {
        center: [-7.3228, 112.7688],
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);

      // Buat LayerGroup khusus untuk menampung seluruh marker
      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      leafletMapRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 300);
    }

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  // 3. RENDER MARKER SETIAP KALI DATA MARKERS BERUBAH
  useEffect(() => {
    const layerGroup = layerGroupRef.current;
    const map = leafletMapRef.current;
    if (!layerGroup || !map) return;

    // Bersihkan marker lama dari layer group
    layerGroup.clearLayers();

    // Gambar ulang semua marker yang ada di state
    markers.forEach((item) => {
      const customIcon = L.divIcon({
        className: "custom-map-marker",
        html: `
          <div class="map-marker ${item.type.toLowerCase()}-marker">
            <span>${item.type}</span>
          </div>
        `,
        iconSize: [50, 50],
        iconAnchor: [25, 25],
      });

      const marker = L.marker([item.lat, item.lng], { icon: customIcon }).bindPopup(`
        <strong>${item.label || item.type}</strong><br />
        Latitude: ${item.lat.toFixed(6)}<br />
        Longitude: ${item.lng.toFixed(6)}
        ${item.keterangan ? `<br />Ket: ${item.keterangan}` : ""}
      `);

      layerGroup.addLayer(marker);
    });

    // Otomatis geser/fokuskan pandangan peta ke marker paling baru yang diinput
    if (markers.length > 0) {
      const lastMarker = markers[markers.length - 1];
      map.setView([lastMarker.lat, lastMarker.lng], 16);
    }
  }, [markers]);

  // HANDLER START
  const handleStart = () => {
    setIsTagging(true);
  };

  // HANDLER STOP
  const handleStop = () => {
    setIsTagging(false);

    const totalPoints = markers.length;
    const estimatedBytes = Math.max(1024 * 15, totalPoints * 2048);

    const formatFileSize = (bytes: number): string => {
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    navigate("/tagging/save", {
      state: { fileSize: formatFileSize(estimatedBytes) },
    });
  };

  // NAVIGASI DENGAN MEMBAWA STATE LENGKAP KE FORM
  const handleMenuClick = (path: string) => {
    if (!isTagging) {
      alert("Silakan klik tombol START terlebih dahulu untuk mengaktifkan sesi tagging!");
      return;
    }

    navigate(path, {
      state: {
        existingMarkers: markers,
        isTagging: true,
      },
    });
  };

  return (
    <MainLayout pageTitle="Tagging Map" activeMenu="tagging">
      <div className="tagging-page">
        {/* MAP SECTION */}
        <section className="tagging-map-section">
          <div ref={mapRef} className="tagging-real-map" />

          {isTagging && (
            <div className="tagging-status">
              <span className="status-dot"></span>
              Tagging aktif — pilih menu di bawah untuk menginput data
            </div>
          )}
        </section>

        {/* CONTROLS */}
        <div className="tagging-controls">
          <button
            type="button"
            className={`tagging-button start-button ${isTagging ? "button-active" : ""}`}
            onClick={handleStart}
          >
            <span className="button-icon">▶</span>
            START
          </button>

          <button
            type="button"
            className="tagging-button stop-button"
            onClick={handleStop}
          >
            <span className="button-icon stop-icon">□</span>
            STOP
          </button>
        </div>

        {/* MENU LEGEND / NAVIGATION CARDS */}
        <section className="tagging-legend">
          <div className="legend-card" onClick={() => handleMenuClick("/tagging/odp")}>
            <div className="legend-icon odp-icon"><span>◉</span></div>
            <div className="legend-text"><strong>ODP</strong></div>
          </div>
          <div className="legend-card" onClick={() => handleMenuClick("/tagging/odc")}>
            <div className="legend-icon odc-icon"><span>▥</span></div>
            <div className="legend-text"><strong>ODC</strong></div>
          </div>
          <div className="legend-card" onClick={() => handleMenuClick("/tagging/tiang")}>
            <div className="legend-icon tiang-icon"><span>◎</span></div>
            <div className="legend-text"><strong>TIANG</strong></div>
          </div>
          <div className="legend-card" onClick={() => handleMenuClick("/tagging/homepass")}>
            <div className="legend-icon homepass-icon"><span>⌂</span></div>
            <div className="legend-text"><strong>HOMEPASS</strong></div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
};

export default TaggingMaps;