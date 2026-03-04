# DKG Agent app

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Build the app

   ```bash
   turbo build
   ```

> You do not have to use `turbo` for this.
> You can just run all package.json `build:*` scripts manually in different terminals.

3. Run setup script

   ```bash
   npm run script:setup
   ```

   The setup flow can also enable async publishing. When enabled, it reuses the
   Engine MySQL password from `dkg-engine/current/.env`, writes the consolidated
   Publisher settings into `apps/agent/.env`, and the Agent loads the Publisher
   plugin only when `ASYNC_PUBLISHING_ENABLED=true`.

Now you can run the app in development mode using:

```bash
turbo dev
```

> You do not have to use `turbo` for this.
> You can just run all package.json `dev:*` scripts manually in different terminals.

> [!NOTE]
> This app comes with a pre-configured Drizzle Studio instance to help you manage your database via web interface.
> You can run it manually by running `npm run drizzle:studio` and it will be available at [https://local.drizzle.studio](https://local.drizzle.studio)

Or the production web app (that you have built in step #2):

```bash
node dist/index.js
```

In the development mode output (`npm run dev:app`), you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.
