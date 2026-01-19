export const POST = async (req: Request) => {
  try {
    // リクエストボディを安全に読み取る
    let body: {
      lat: number;
      lng: number;
      measureUnit: 'Imperial' | 'Metric';
    };

    try {
      const text = await req.text();
      if (!text || text.trim() === '') {
        console.error('[Weather API] Empty request body');
        return Response.json(
          {
            message: 'Request body is required.',
          },
          { status: 400 },
        );
      }
      body = JSON.parse(text);
    } catch (parseError) {
      console.error('[Weather API] JSON parse error:', parseError);
      return Response.json(
        {
          message: 'Invalid JSON in request body.',
        },
        { status: 400 },
      );
    }

    console.log('[Weather API] Request received:', { lat: body.lat, lng: body.lng, measureUnit: body.measureUnit });

    if (!body.lat || !body.lng || isNaN(body.lat) || isNaN(body.lng)) {
      console.error('[Weather API] Invalid request parameters');
      return Response.json(
        {
          message: 'Invalid request.',
        },
        { status: 400 },
      );
    }

    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${body.lat}&longitude=${body.lng}&current=weather_code,temperature_2m,is_day,relative_humidity_2m,wind_speed_10m&timezone=auto${
      body.measureUnit === 'Metric' ? '' : '&temperature_unit=fahrenheit'
    }${body.measureUnit === 'Metric' ? '' : '&wind_speed_unit=mph'}`;

    console.log('[Weather API] Fetching from:', apiUrl);

    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`[Weather API] HTTP error! status: ${res.status}`);
      return Response.json(
        {
          message: 'Failed to fetch weather data.',
        },
        { status: res.status },
      );
    }

    const data = await res.json();
    console.log('[Weather API] Response received:', data);

    if (data.error) {
      console.error(`[Weather API] Error in response: ${data.reason}`);
      return Response.json(
        {
          message: 'An error has occurred.',
        },
        { status: 500 },
      );
    }

    if (!data.current) {
      console.error('[Weather API] Missing current weather data');
      return Response.json(
        {
          message: 'Invalid weather data received.',
        },
        { status: 500 },
      );
    }

    const weather: {
      temperature: number;
      condition: string;
      humidity: number;
      windSpeed: number;
      icon: string;
      temperatureUnit: 'C' | 'F';
      windSpeedUnit: 'm/s' | 'mph';
    } = {
      temperature: data.current.temperature_2m,
      condition: '',
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      icon: '',
      temperatureUnit: body.measureUnit === 'Metric' ? 'C' : 'F',
      windSpeedUnit: body.measureUnit === 'Metric' ? 'm/s' : 'mph',
    };

    const code = data.current.weather_code;
    const isDay = data.current.is_day === 1;
    const dayOrNight = isDay ? 'day' : 'night';

    switch (code) {
      case 0:
        weather.icon = `clear-${dayOrNight}`;
        weather.condition = 'Clear';
        break;

      case 1:
        weather.condition = 'Mainly Clear';
      case 2:
        weather.condition = 'Partly Cloudy';
      case 3:
        weather.icon = `cloudy-1-${dayOrNight}`;
        weather.condition = 'Cloudy';
        break;

      case 45:
        weather.condition = 'Fog';
      case 48:
        weather.icon = `fog-${dayOrNight}`;
        weather.condition = 'Fog';
        break;

      case 51:
        weather.condition = 'Light Drizzle';
      case 53:
        weather.condition = 'Moderate Drizzle';
      case 55:
        weather.icon = `rainy-1-${dayOrNight}`;
        weather.condition = 'Dense Drizzle';
        break;

      case 56:
        weather.condition = 'Light Freezing Drizzle';
      case 57:
        weather.icon = `frost-${dayOrNight}`;
        weather.condition = 'Dense Freezing Drizzle';
        break;

      case 61:
        weather.condition = 'Slight Rain';
      case 63:
        weather.condition = 'Moderate Rain';
      case 65:
        weather.condition = 'Heavy Rain';
        weather.icon = `rainy-2-${dayOrNight}`;
        break;

      case 66:
        weather.condition = 'Light Freezing Rain';
      case 67:
        weather.condition = 'Heavy Freezing Rain';
        weather.icon = 'rain-and-sleet-mix';
        break;

      case 71:
        weather.condition = 'Slight Snow Fall';
      case 73:
        weather.condition = 'Moderate Snow Fall';
      case 75:
        weather.condition = 'Heavy Snow Fall';
        weather.icon = `snowy-2-${dayOrNight}`;
        break;

      case 77:
        weather.condition = 'Snow';
        weather.icon = `snowy-1-${dayOrNight}`;
        break;

      case 80:
        weather.condition = 'Slight Rain Showers';
      case 81:
        weather.condition = 'Moderate Rain Showers';
      case 82:
        weather.condition = 'Heavy Rain Showers';
        weather.icon = `rainy-3-${dayOrNight}`;
        break;

      case 85:
        weather.condition = 'Slight Snow Showers';
      case 86:
        weather.condition = 'Moderate Snow Showers';
      case 87:
        weather.condition = 'Heavy Snow Showers';
        weather.icon = `snowy-3-${dayOrNight}`;
        break;

      case 95:
        weather.condition = 'Thunderstorm';
        weather.icon = `scattered-thunderstorms-${dayOrNight}`;
        break;

      case 96:
        weather.condition = 'Thunderstorm with Slight Hail';
      case 99:
        weather.condition = 'Thunderstorm with Heavy Hail';
        weather.icon = 'severe-thunderstorm';
        break;

      default:
        weather.icon = `clear-${dayOrNight}`;
        weather.condition = 'Clear';
        break;
    }

    return Response.json(weather);
  } catch (err) {
    console.error('An error occurred while getting home widgets', err);
    return Response.json(
      {
        message: 'An error has occurred.',
      },
      {
        status: 500,
      },
    );
  }
};
