import AsyncStorage from '@react-native-async-storage/async-storage';
import { createFixtureBoardCache } from './fixtureBoardCache';

export const fixtureBoardCache = createFixtureBoardCache(AsyncStorage);
