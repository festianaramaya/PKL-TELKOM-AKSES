import React, { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MainLayout from "../../components/MainLayout";
import "../../assets/Tagging/TaggingTracking.css";

interface TaggingMarkerData {
  id: string;
  lat: number;
  lng: number;
  type: string;
  label?: string;
}

export const TaggingTracking: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);

  const markers: TaggingMarkerData[] = location.state?.markers || [];

  useEffect(() => {
    if (!mapRef.current) return;
    if (leafletMapRef.current) return;

    const defaultCenter: L.LatLngTuple =
      markers.length > 0 ? [markers[0].lat, markers[0].lng] : [-7.3228, 112.7688];

    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: 14,
      zoomControl: true,
    });

    leafletMapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    if (markers.length > 0) {
      const polylineCoords: L.LatLngTuple[] = markers.map((m) => [m.lat, m.lng]);

      L.polyline(polylineCoords, {
        color: "#0f172a",
        weight: 3.5,
        opacity: 0.9,
      }).addTo(map);

      markers.forEach((item, index) => {
        const isStart = index === 0;
        const isStop = index === markers.length - 1;
        const currentType = item.type.toUpperCase();

        // Render bentuk ikon Hitam Putih untuk Web Tracking
        let shapeHtml = '<div class="icon-tiang-geom"></div>';
        
        if (currentType === "ODP") {
          // ODP Hitam Putih (Lingkaran Merah di Google Earth -> Lingkaran Hitam Putih di Web)
          shapeHtml = '<div class="icon-odp-geom"><div class="inner-dot"></div></div>';
        } else if (currentType === "ODC") {
          // ODC Hitam Putih (Segitiga Hitam Putih)
          shapeHtml = '<div class="icon-odc-geom"></div>';
        } else if (currentType === "HOMEPASS") {
          shapeHtml = '<div class="icon-homepass-geom"><div class="roof"></div><div class="base"></div></div>';
        }

        const pinHtml = `
          <div class="figma-tracking-pin">
            ${isStart ? '<div class="badge-capsule start-capsule">START</div>' : ""}
            ${isStop ? '<div class="badge-capsule stop-capsule">STOP</div>' : ""}
            
            <div class="shape-container">
              ${shapeHtml}
            </div>
            
            <div class="label-capsule">
              <span>${item.label || item.type}</span>
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          className: "leaflet-tracking-marker-container",
          html: pinHtml,
          iconSize: [140, 40],
          iconAnchor: [20, 20],
        });

        L.marker([item.lat, item.lng], { icon: customIcon }).addTo(map);
      });

      const bounds = L.latLngBounds(polylineCoords);
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 300);

    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, [markers]);

  return (
    <MainLayout pageTitle="Tagging TRACKING" activeMenu="tagging">
      <div className="tracking-page-container">
        <div className="tracking-map-card">
          <div ref={mapRef} className="tracking-leaflet-map" />

          {/* Legend Hitam Putih */}
          <div className="figma-map-legend">
            <div className="legend-row">
              <div className="legend-icon-box"><div className="icon-tiang-geom" style={{transform: 'scale(0.8)'}}></div></div>
              <span>TIANG</span>
            </div>
            <div className="legend-row">
              <div className="legend-icon-box"><div className="icon-odp-geom" style={{transform: 'scale(0.8)'}}><div className="inner-dot"></div></div></div>
              <span>ODP</span>
            </div>
            <div className="legend-row">
              <div className="legend-icon-box"><div className="icon-odc-geom" style={{transform: 'scale(0.6)'}}></div></div>
              <span>ODC</span>
            </div>
            <div className="legend-row">
              <div className="legend-icon-box"><div className="icon-homepass-geom" style={{transform: 'scale(0.7)'}}><div className="roof"></div><div className="base"></div></div></div>
              <span>HOMEPASS</span>
            </div>
          </div>
        </div>

        <div className="tracking-bottom-controls">
          <button
            type="button"
            className="btn-start-tracking"
            onClick={() => navigate("/tagging")}
          >
            <span className="play-icon">▶</span> START
          </button>
          <button type="button" className="btn-stop-tracking" disabled>
            <span className="square-icon">□</span> STOP
          </button>
        </div>
      </div>
    </MainLayout>
  );
};

export default TaggingTracking;