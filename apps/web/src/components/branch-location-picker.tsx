import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, X } from "lucide-react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { Button } from "@/components/ui/button";

/**
 * Leaflet ships its default marker icon as a relative path that bundlers
 * (Vite included) don't rewrite automatically. Configure the default once
 * here with the asset URLs that Vite *does* hash + serve correctly, so any
 * `new L.Marker()` shows the standard pin.
 */
const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

/** Addis Ababa city center — sensible default for an Ethiopian merchant
 *  who hasn't pinned anything yet. */
const DEFAULT_CENTER: [number, number] = [9.03, 38.74];
const DEFAULT_ZOOM = 12;

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface BranchLocationPickerProps {
  value: LatLng | null;
  onChange: (next: LatLng | null) => void;
  /** Tailwind height for the map element; defaults to a comfortable wizard size. */
  className?: string;
}

/**
 * Map-based geo-pin picker for a branch location. Click anywhere on the map
 * to drop the pin; drag it to refine. "Use my location" pulls from the
 * browser's geolocation API (user-prompted). The "Clear" affordance lets the
 * merchant unpin entirely if they prefer not to share coords.
 */
export function BranchLocationPicker({
  value,
  onChange,
  className,
}: BranchLocationPickerProps) {
  const [busyLocate, setBusyLocate] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocateError("Geolocation isn't available in this browser.");
      return;
    }
    setBusyLocate(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setBusyLocate(false);
      },
      (err) => {
        setBusyLocate(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. Click anywhere on the map to pin instead."
            : "Couldn't read your location. Click on the map to pin instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
    );
  }

  const center: [number, number] = value
    ? [value.latitude, value.longitude]
    : DEFAULT_CENTER;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={
          className ?? "h-64 overflow-hidden rounded-lg border bg-muted/30"
        }
      >
        <MapContainer
          center={center}
          zoom={DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RecenterOn value={value} />
          <ClickToPin onPin={onChange} />
          {value && (
            <DraggableMarker
              position={[value.latitude, value.longitude]}
              onDragEnd={(latlng) =>
                onChange({ latitude: latlng.lat, longitude: latlng.lng })
              }
            />
          )}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={useMyLocation}
          disabled={busyLocate}
        >
          <Crosshair className="size-3.5" />
          {busyLocate ? "Locating…" : "Use my location"}
        </Button>
        {value ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11px]">
              <MapPin className="size-3 text-[#5700FF]" />
              {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
            >
              <X className="size-3.5" />
              Clear
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground">
            Click the map to pin your branch's location. Optional.
          </span>
        )}
        {locateError && (
          <span className="text-destructive">{locateError}</span>
        )}
      </div>
    </div>
  );
}

/** Click handler that turns any map click into a pin update. */
function ClickToPin({ onPin }: { onPin: (next: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPin({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  return null;
}

/** Marker that supports drag-to-refine. react-leaflet's typing makes this
 *  slightly awkward — we wire eventHandlers manually so the parent can hold
 *  the value and we don't fight the controlled-input model. */
function DraggableMarker({
  position,
  onDragEnd,
}: {
  position: [number, number];
  onDragEnd: (latlng: { lat: number; lng: number }) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  return (
    <Marker
      position={position}
      draggable
      ref={(m) => {
        markerRef.current = m;
      }}
      eventHandlers={{
        dragend: () => {
          const m = markerRef.current;
          if (!m) return;
          const ll = m.getLatLng();
          onDragEnd({ lat: ll.lat, lng: ll.lng });
        },
      }}
    />
  );
}

/** Re-centres the map when the value swaps from null → coords (e.g. after
 *  "Use my location"). Doesn't move the view on every value change because
 *  that would fight the user's panning. */
function RecenterOn({ value }: { value: LatLng | null }) {
  const map = useMapEvents({});
  const lastValueRef = useRef<LatLng | null>(value);
  useEffect(() => {
    const had = lastValueRef.current;
    if (!had && value) {
      map.setView([value.latitude, value.longitude], DEFAULT_ZOOM);
    }
    lastValueRef.current = value;
  }, [map, value]);
  return null;
}
