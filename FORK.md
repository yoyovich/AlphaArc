# Sail: рабочая база форка yoyovich

Исходный проект: https://github.com/SailfishBrowser/iOS
Базовый коммит: `608e04a919f1685afe5420b29e9906ae7658abb2`.
Лицензия: Apache-2.0; LICENSE и THIRD_PARTY_NOTICES.md сохранены.

## Текущее состояние

Подготовлена локальная ветка `fork/yoyovich`. В Test workflow снято ограничение
на имя репозитория, чтобы существующие тесты запускались и в форке.
Функциональные изменения по прошлым обсуждениям пока не внесены: история чатов
недоступна в этой сессии, требования нужно восстановить с владельцем.
Создать удалённый форк не удалось: GitHub API вернул
`403 Resource not accessible by integration` на POST /repos/SailfishBrowser/iOS/forks.

## Создание удалённого форка

Войти в GitHub под yoyovich и открыть:
https://github.com/SailfishBrowser/iOS/fork

Выбрать имя sail. Затем из этого каталога:

```sh
git remote add origin https://github.com/yoyovich/sail.git
git push -u origin fork/yoyovich
```

## Сборка

Требуются macOS, Xcode 26.5+, XcodeGen и iOS 26+.

```sh
cd iOS
xcodegen generate
open SailBrowser.xcodeproj
# Проверки на Mac:
scripts/build.sh
scripts/test.sh
```

В Linux текущей сессии Xcode и iOS Simulator отсутствуют, сборка и тесты
приложения не запускались. Наличие workflow не означает успешную сборку.

Для установки на свой iPhone выбрать свою Apple Developer Team и уникальный
Bundle Identifier в project.yml. Перед подписанием настроить собственный
CloudKit container: исходный проект содержит iCloud.com.harunkkhan.browser
в entitlements и коде. Не использовать идентификаторы и ключи авторов.
Для TestFlight потребуются собственные App Store Connect и signing credentials.

## Требования к следующей итерации

Ожидается описание ключевых идей владельца: сценарии, интерфейс, функции
и приоритет первой версии. Никакие предположения об этих идеях не выдаются
за ранее согласованные решения.
