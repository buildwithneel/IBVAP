/**
 * Weather Service for IBVAP Command Console
 * Real-time meteorological telemetry powered by Open-Meteo Free Tier API (Zero-auth/Keyless)
 * and BigDataCloud reverse geocoding.
 */

export interface WeatherData {
  temp: number;
  apparentTemp: number;
  city: string;
  condition: string;
  conditionDescription: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  isDay: boolean;
  latitude: number;
  longitude: number;
  isCustomLocation: boolean;
  lastUpdated: string;
  timestamp: number;
}

const CACHE_STORAGE_KEY = "ibvap_weather_telemetry_cache";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

// Default Command Sector Headquarters coordinates: Vadodara Command Sector (Gujarat)
const DEFAULT_LAT = 22.3072;
const DEFAULT_LON = 73.1812;
const DEFAULT_CITY = "Vadodara";

/**
 * Maps WMO Weather Interpretation Codes to friendly military/tactical conditions & icons
 */
export function mapWmoCode(
  code: number,
  isDay: boolean = true
): { condition: string; description: string; icon: string } {
  switch (code) {
    case 0:
      return {
        condition: "Clear",
        description: isDay ? "Clear Daylight Visibility" : "Clear Night Sky",
        icon: isDay ? "☀" : "🌙",
      };
    case 1:
      return {
        condition: "Mainly Clear",
        description: "Scattered High Atmosphere Clouds",
        icon: isDay ? "🌤" : "🌤",
      };
    case 2:
      return {
        condition: "Partly Cloudy",
        description: "Intermittent Cloud Cover",
        icon: isDay ? "⛅" : "☁",
      };
    case 3:
      return {
        condition: "Overcast",
        description: "Dense Cloud Ceiling / Low Contrast",
        icon: "☁",
      };
    case 45:
    case 48:
      return {
        condition: "Foggy",
        description: "Reduced Optical Visibility Range",
        icon: "🌫",
      };
    case 51:
    case 53:
    case 55:
      return {
        condition: "Drizzle",
        description: "Light Atmospheric Misting",
        icon: "🌦",
      };
    case 61:
    case 63:
    case 65:
      return {
        condition: "Rain",
        description: "Precipitation / Lens Flare Risk",
        icon: "🌧",
      };
    case 71:
    case 73:
    case 75:
    case 77:
      return {
        condition: "Snow",
        description: "Snowfall / Surface Accumulation",
        icon: "❄",
      };
    case 80:
    case 81:
    case 82:
      return {
        condition: "Showers",
        description: "Heavy Intermittent Rain Showers",
        icon: "🌧",
      };
    case 95:
    case 96:
    case 99:
      return {
        condition: "Storm",
        description: "Severe Thunderstorm / Thermal Noise",
        icon: "⛈",
      };
    default:
      return {
        condition: "Fair",
        description: "Standard Tactical Operational Condition",
        icon: isDay ? "☀" : "🌙",
      };
  }
}

/**
 * Attempt to get device geographic coordinates with a short timeout.
 * Gracefully falls back to Sector HQ coords if blocked or timed out.
 */
async function getDeviceCoordinates(): Promise<{
  lat: number;
  lon: number;
  isCustom: boolean;
}> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return { lat: DEFAULT_LAT, lon: DEFAULT_LON, isCustom: false };
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON, isCustom: false });
    }, 2500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          isCustom: true,
        });
      },
      () => {
        clearTimeout(timer);
        resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON, isCustom: false });
      },
      { timeout: 2500, enableHighAccuracy: false }
    );
  });
}

/**
 * Reverse geocode latitude and longitude to get human-readable city/locality name.
 */
async function reverseGeocodeCity(lat: number, lon: number, isCustom: boolean): Promise<string> {
  if (!isCustom) {
    return DEFAULT_CITY;
  }
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    );
    if (res.ok) {
      const data = await res.json();
      return (
        data.city ||
        data.locality ||
        data.principalSubdivision ||
        DEFAULT_CITY
      );
    }
  } catch (err) {
    console.warn("Reverse geocode request failed:", err);
  }
  return DEFAULT_CITY;
}

/**
 * Fetch live weather telemetry from Open-Meteo free API
 */
export async function fetchLiveWeather(forceRefresh: boolean = false): Promise<WeatherData> {
  // Check cached telemetry unless force refresh requested
  if (!forceRefresh && typeof window !== "undefined") {
    try {
      const cachedRaw = localStorage.getItem(CACHE_STORAGE_KEY);
      if (cachedRaw) {
        const cached: WeatherData = JSON.parse(cachedRaw);
        if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
          return cached;
        }
      }
    } catch {
      // ignore JSON parse errors
    }
  }

  // Determine target coordinates
  const { lat, lon, isCustom } = await getDeviceCoordinates();

  // Fetch Open-Meteo live forecast
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&timezone=auto`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather service returned HTTP ${response.status}`);
  }

  const data = await response.json();
  const current = data.current || {};

  const isDay = current.is_day === 1;
  const weatherCode = current.weather_code ?? 0;
  const conditionMeta = mapWmoCode(weatherCode, isDay);

  const cityName = await reverseGeocodeCity(lat, lon, isCustom);

  const now = new Date();
  const timeFormatted = now.toLocaleTimeString("en-IN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  const weatherResult: WeatherData = {
    temp: Math.round(current.temperature_2m ?? 28),
    apparentTemp: Math.round(current.apparent_temperature ?? current.temperature_2m ?? 28),
    city: cityName,
    condition: conditionMeta.condition,
    conditionDescription: conditionMeta.description,
    icon: conditionMeta.icon,
    humidity: Math.round(current.relative_humidity_2m ?? 50),
    windSpeed: Math.round((current.wind_speed_10m ?? 10) * 10) / 10,
    precipitation: current.precipitation ?? 0,
    isDay,
    latitude: Math.round(lat * 100) / 100,
    longitude: Math.round(lon * 100) / 100,
    isCustomLocation: isCustom,
    lastUpdated: timeFormatted,
    timestamp: Date.now(),
  };

  // Cache in localStorage
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(weatherResult));
    } catch {
      // quota or local storage restriction
    }
  }

  return weatherResult;
}
