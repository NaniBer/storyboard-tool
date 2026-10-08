# Example storyboard: The letter outside the café

Three generated cinematic reference frames show Ada approaching a rainy café, noticing a sealed letter, and lifting it from the table. The images are WebP files accepted by the app's upload processor.

With the API running and temporary login enabled, seed the existing shared workspace:

```sh
node scripts/seed-example.mjs http://127.0.0.1:3001/api --generate-prompts
```

The script reuses a scene with the exact example title, creates missing shots, uploads any missing images, checks that processing finishes, and verifies PDF export. `--generate-prompts` asks the configured OpenRouter model to generate and approve prompts; omit it if the provider is unavailable.
