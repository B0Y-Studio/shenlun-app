# Task 7 Report: Connect API to Screens

## Status

Completed successfully.

## TypeScript Errors

None. All TypeScript errors were resolved:

1. **TS2459 on Article/Note types** - The `Article` and `Note` types were imported into `client.ts` from `storage/mmkv` but not re-exported. Fixed by adding `export type { Article, Note };` to `src/api/client.ts`.

2. **TS2339 on article.date** - The `Article` interface does not have a `date` field. Removed the date line from the metadata display in `ReaderScreen.tsx`.

## Changes Made

### src/screens/HomeScreen.tsx
- Added `useEffect`, `ActivityIndicator` to imports
- Added `Article` type import from `../api/client`
- Replaced static `SAMPLE` array with `useState<Article[]>([])` and `useState(true)` for loading
- Added `useEffect` calling `getDaily()` on mount
- Replaced `SAMPLE.map` with conditional rendering: loading spinner or `articles.map`
- Added `loading` and `loadingText` styles

### src/screens/ReaderScreen.tsx
- Added `useState`, `useEffect`, `ActivityIndicator` to imports
- Added `Article` type and `getCachedArticles` imports
- Removed static `SAMPLE_ARTICLE` constant
- Added `article` state and `loading` state
- Added `useEffect` calling `getArticle(id)` with fallback to cached articles
- Added early-return loading state and "not found" error state
- Replaced all `SAMPLE_ARTICLE.*` references with `article?.*` accessors
- Added `loading` and `errorText` styles

### src/screens/GoldScreen.tsx
- Added `useState`, `useEffect`, `ActivityIndicator` to imports
- Added `Note` type import from `../api/client`
- Removed static `SAMPLE_NOTES` constant
- Added `notes` state and `loading` state
- Added `useEffect` calling `getNotes()` on mount
- Replaced `SAMPLE_NOTES` in FlatList data with `notes`
- Added loading spinner conditional wrapper around FlatList
- Added `loading` style

### src/api/client.ts
- Added `export type { Article, Note };` to re-export types from `storage/mmkv`

## Commit Hash

`f59d782`
