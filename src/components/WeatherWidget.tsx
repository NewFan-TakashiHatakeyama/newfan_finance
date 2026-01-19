import { Cloud, Sun, CloudRain, CloudSnow, Wind } from 'lucide-react';
import { useEffect, useState } from 'react';

const WeatherWidget = () => {
  const [data, setData] = useState({
    temperature: 0,
    condition: '',
    location: '',
    humidity: 0,
    windSpeed: 0,
    icon: '',
    temperatureUnit: 'C',
    windSpeedUnit: 'm/s',
  });

  const [loading, setLoading] = useState(true);

  const getApproxLocation = async () => {
    try {
      const res = await fetch('https://ipwhois.app/json/');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      
      if (!data.latitude || !data.longitude) {
        throw new Error('Invalid location data from IP service');
      }

      return {
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city || 'Unknown',
      };
    } catch (error) {
      console.error('Error getting approximate location:', error);
      // デフォルトの位置（東京）を返す
      return {
        latitude: 35.6762,
        longitude: 139.6503,
        city: 'Tokyo',
      };
    }
  };

  const getLocation = async (
    callback: (location: {
      latitude: number;
      longitude: number;
      city: string;
    }) => void,
  ) => {
    try {
      if (navigator.geolocation) {
        const result = await navigator.permissions.query({
          name: 'geolocation',
        });

        if (result.state === 'granted') {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              try {
                const res = await fetch(
                  `https://api-bdc.io/data/reverse-geocode-client?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}&localityLanguage=en`,
                  {
                    method: 'GET',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                  },
                );

                if (!res.ok) {
                  throw new Error(`HTTP error! status: ${res.status}`);
                }

                const data = await res.json();

                callback({
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  city: data.locality || 'Unknown',
                });
              } catch (error) {
                console.error('Error getting city from coordinates:', error);
                callback({
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  city: 'Unknown',
                });
              }
            },
            async (error) => {
              console.error('Geolocation error:', error);
              const approxLocation = await getApproxLocation();
              callback(approxLocation);
            },
            { timeout: 10000 }
          );
        } else if (result.state === 'prompt') {
          callback(await getApproxLocation());
          navigator.geolocation.getCurrentPosition(
            (position) => {},
            (error) => {
              console.error('Geolocation error after prompt:', error);
            }
          );
        } else if (result.state === 'denied') {
          callback(await getApproxLocation());
        }
      } else {
        callback(await getApproxLocation());
      }
    } catch (error) {
      console.error('Error in getLocation:', error);
      callback(await getApproxLocation());
    }
  };

  const updateWeather = async () => {
    try {
      getLocation(async (location) => {
        try {
          console.log('[WeatherWidget] Fetching weather for location:', location);
          
          const res = await fetch(`/api/weather`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              lat: location.latitude,
              lng: location.longitude,
              measureUnit: typeof window !== 'undefined' ? (localStorage.getItem('measureUnit') ?? 'Metric') : 'Metric',
            }),
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.error('[WeatherWidget] API error:', res.status, errorData);
            setLoading(false);
            return;
          }

          const data = await res.json();
          console.log('[WeatherWidget] Weather data received:', data);

          if (!data.temperature && data.temperature !== 0) {
            console.error('[WeatherWidget] Invalid weather data:', data);
            setLoading(false);
            return;
          }

          setData({
            temperature: data.temperature,
            condition: data.condition || 'Unknown',
            location: location.city,
            humidity: data.humidity || 0,
            windSpeed: data.windSpeed || 0,
            icon: data.icon || 'clear-day',
            temperatureUnit: data.temperatureUnit || 'C',
            windSpeedUnit: data.windSpeedUnit || 'm/s',
          });
          setLoading(false);
        } catch (error) {
          console.error('[WeatherWidget] Error fetching weather data:', error);
          setLoading(false);
        }
      });
    } catch (error) {
      console.error('[WeatherWidget] Error in updateWeather:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    updateWeather();
    const intervalId = setInterval(updateWeather, 2 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="bg-light-secondary dark:bg-dark-secondary rounded-2xl border border-light-200 dark:border-dark-200 shadow-sm shadow-light-200/10 dark:shadow-black/25 flex flex-row items-center w-full h-32 px-3 py-2 gap-3">
      {loading ? (
        <>
          <div className="flex flex-col items-center justify-center w-16 min-w-16 max-w-16 h-full animate-pulse">
            <div className="h-10 w-10 rounded-full bg-light-200 dark:bg-dark-200 mb-2" />
            <div className="h-4 w-10 rounded bg-light-200 dark:bg-dark-200" />
          </div>
          <div className="flex flex-col justify-between flex-1 h-full py-1 animate-pulse">
            <div className="flex flex-row items-center justify-between">
              <div className="h-3 w-20 rounded bg-light-200 dark:bg-dark-200" />
              <div className="h-3 w-12 rounded bg-light-200 dark:bg-dark-200" />
            </div>
            <div className="h-3 w-16 rounded bg-light-200 dark:bg-dark-200 mt-1" />
            <div className="flex flex-row justify-between w-full mt-auto pt-1 border-t border-light-200 dark:border-dark-200">
              <div className="h-3 w-16 rounded bg-light-200 dark:bg-dark-200" />
              <div className="h-3 w-8 rounded bg-light-200 dark:bg-dark-200" />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center justify-center w-16 min-w-16 max-w-16 h-full">
            <img
              src={`/weather-ico/${data.icon}.svg`}
              alt={data.condition}
              className="h-10 w-auto"
            />
            <span className="text-base font-semibold text-black dark:text-white">
              {data.temperature}°{data.temperatureUnit}
            </span>
          </div>
          <div className="flex flex-col justify-between flex-1 h-full py-2">
            <div className="flex flex-row items-center justify-between">
              <span className="text-sm font-semibold text-black dark:text-white">
                {data.location}
              </span>
              <span className="flex items-center text-xs text-black/60 dark:text-white/60 font-medium">
                <Wind className="w-3 h-3 mr-1" />
                {data.windSpeed} {data.windSpeedUnit}
              </span>
            </div>
            <span className="text-xs text-black/50 dark:text-white/50 italic">
              {data.condition}
            </span>
            <div className="flex flex-row justify-between w-full mt-auto pt-2 border-t border-light-200/50 dark:border-dark-200/50 text-xs text-black/50 dark:text-white/50 font-medium">
              <span>Humidity {data.humidity}%</span>
              <span className="font-semibold text-black/70 dark:text-white/70">
                Now
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WeatherWidget;
