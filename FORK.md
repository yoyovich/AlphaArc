# Sail — рабочая база форка yoyovich

Исходный проект: https://github.com/SailfishBrowser/iOS
Базовый коммит: `608e04a919f1685afe5420b29e9906ae7658abb2`.
Лицензия Apache-2.0; LICENSE и THIRD_PARTY_NOTICES.md сохранены.
Локальная ветка: `fork/yoyovich`.

## Что готово

- Отдельный XcodeGen overlay `iOS/fork.yml`: bundle ID `com.yoyovich.sail`,
  тестовый ID `com.yoyovich.sail.tests`, контейнер `iCloud.com.yoyovich.sail`.
- Исходный `project.yml` сохраняет идентификаторы upstream. Entitlements используют
  `SAIL_ICLOUD_CONTAINER`; приложение выбирает контейнер из своих entitlements.
- Скрипты build/test/archive по умолчанию генерируют проект из `fork.yml`.
- Test workflow работает и на ветках `fork/**`; добавлен Linux workflow для
  ресурсов, Python-тестов и ShellCheck.
- Исправлен останов обновления PageShield из-за повреждённого правила; добавлены
  регрессионные тесты. Проверки описаны в [VERIFICATION.md](VERIFICATION.md).
- Генерируемые файлы Xcode и загрузки конвертера исключены из Git.

Добавлены функции из последнего запроса: необходимые cookie, менеджер cookie сайта,
принудительная тёмная тема, русский интерфейс и исключения для сайтов.
Описание поведения — в [FEATURES.md](FEATURES.md).

## Удалённый репозиторий

Создание форка через GitHub API завершилось `403 Resource not accessible by integration`.
Удалённый форк не создан и ветка не опубликована.

Открыть https://github.com/SailfishBrowser/iOS/fork под yoyovich и выбрать имя `sail`.
Затем из каталога локальной копии:

```sh
git remote add origin https://github.com/yoyovich/sail.git
git push -u origin fork/yoyovich
```

Исходный репозиторий подключён как `upstream`. Workflow появятся после push;
локальные проверки не означают, что GitHub Actions уже запускались.

## Сборка на Mac

Нужны Xcode 26.5+, XcodeGen, iOS 26+ и симулятор iPhone 17 Pro.

```sh
brew install xcodegen shellcheck actionlint python node
cd iOS
xcodegen generate --spec fork.yml
open SailBrowser.xcodeproj
```

В Xcode выбрать свою Apple Developer Team. Перед запуском на устройстве
зарегистрировать собственные App ID и iCloud container, включить CloudKit и push
capabilities и создать provisioning profile. Идентификаторы в overlay —
настройки исходников, а не уже созданные ресурсы Apple.

Контейнер форка отдельный: вкладки из официального Sailfish для Mac в нём
не появятся. Для своей синхронизации нужен Mac-клиент с тем же контейнером и схемой CloudKit.

Полная проверка на настроенном Mac, из корня репозитория:

```sh
iOS/scripts/verify.sh --ios
```

Команда без дополнительных флагов проверяет ресурсы, Python-тесты, ShellCheck
и actionlint. Для браузерных проверок установить Node.js 20+ и зависимости:

```sh
npm ci --ignore-scripts --prefix iOS/scripts/browser-tests
cd iOS/scripts/browser-tests
npx playwright install chromium webkit
cd ../../..
iOS/scripts/verify.sh --web
```

На Linux для системных библиотек браузеров используется `npx playwright install --with-deps chromium webkit`
в подходящей среде. В GitHub Actions установка зависимостей настроена.

`--web` проверяет десять конфигураций Chromium/WebKit: светлый/тёмный desktop,
светлый/тёмный телефон и горизонтальный телефон с ru-RU. Фикстуры перехватывают
весь сетевой трафик: реальным сайтам запросы не отправляются.
Логи находятся в `iOS/.build/browser-checks`; каталог можно изменить через
`SAIL_TEST_REPORT_DIR`. Отдельный запуск матрицы: `iOS/scripts/test-browser-matrix.sh`.

На настроенном Mac `iOS/scripts/verify.sh --all` выполняет статические проверки,
браузерную матрицу, сборку и Swift-тесты. Проверки без доступных Apple SDK
не подменяются успешным результатом: сборка и Swift-тесты явно пропускаются
без флага `--ios` либо завершаются ошибкой, если он указан в Linux.

Для повторения демонстрационных скриншотов веб-страницы:

```sh
node iOS/scripts/browser-tests/preview.mjs
```

Для воспроизведения сборки с исходными настройками:

```sh
SAIL_PROJECT_SPEC=project.yml iOS/scripts/build.sh
SAIL_PROJECT_SPEC=project.yml iOS/scripts/test.sh
```

Для проверки архива с иным ID задать `SAIL_EXPECTED_BUNDLE_IDENTIFIER`.
При архивировании upstream это `com.haladir.arcmobile`.

## TestFlight

Нужны собственные Apple Developer и App Store Connect, а также DEVELOPMENT_TEAM,
ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH. Эти credentials не настроены в сессии.
Существующий Release workflow оставлен с ограничением на upstream: его нельзя
просто включить в форке, так как он содержит ссылку на TestFlight авторов
и операции с их конфигурацией релизов. Для собственной публикации его нужно
адаптировать после настройки своего приложения в App Store Connect.

Подписанного IPA и установки на iPhone в этой сессии нет.
