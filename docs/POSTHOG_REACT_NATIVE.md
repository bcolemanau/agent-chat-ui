# PostHog + React Native (Expo) integration

Use this when adding PostHog to an Expo / React Native app (e.g. future OrcSynch mobile).

Reference: [PostHog React Native docs](https://posthog.com/docs/libraries/react-native).

---

## Automated setup (recommended)

From the **root of your React Native project**:

```bash
npx -y @posthog/wizard@latest
```

Run in an **interactive terminal** (wizard is not non-interactive/CI-friendly).

---

## Manual installation

### 1. Install the package (Expo)

```bash
npx expo install posthog-react-native expo-file-system expo-application expo-device expo-localization
```

Or with yarn/npm:

- **yarn:** `yarn add posthog-react-native` + Expo deps above.
- **npm:** `npm install posthog-react-native` + Expo deps above.

### 2. Configure PostHog

Wrap the app with `PostHogProvider`. Prefer env for the API key (e.g. `EXPO_PUBLIC_POSTHOG_KEY` or `POSTHOG_API_KEY` in app config):

```tsx
import { PostHogProvider } from 'posthog-react-native'

// Use env / app config – do not commit phc_xxx to repo
const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? ''
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

export function App() {
  if (!apiKey) {
    return <RestOfApp /> // no-op when PostHog not configured
  }
  return (
    <PostHogProvider
      apiKey={apiKey}
      options={{ host }}
    >
      <RestOfApp />
    </PostHogProvider>
  )
}
```

### 3. Send events

PostHog captures events automatically. For custom events, use `usePostHog`:

```tsx
import { usePostHog } from 'posthog-react-native'

function MyComponent() {
  const posthog = usePostHog()

  const handlePress = () => {
    posthog?.capture('button_pressed', { button_name: 'signup' })
  }

  return <Button onPress={handlePress} title="Sign Up" />
}
```

---

## Env vars (example)

In `.env` or Expo config (e.g. `app.config.js` with `extra`):

- `EXPO_PUBLIC_POSTHOG_KEY` – project API key (e.g. `phc_xxx` from [PostHog project settings](https://app.posthog.com/project/settings)).
- `EXPO_PUBLIC_POSTHOG_HOST` – `https://us.i.posthog.com` (US) or `https://eu.i.posthog.com` (EU).

Keep the same PostHog project as the web app if you want one product view; use a separate project for mobile-only analytics if you prefer.
