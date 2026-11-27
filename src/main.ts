import { AUTO, Game, Scale, Types } from 'phaser';
import GameOverScene from "./scenes/GameOverScene.ts";
import HomeScene from "./scenes/HomeScene.ts";
import LevelUpScene from "./scenes/LevelUpScene.ts";
import MainGameScene from './scenes/MainGameScene.ts';
import MainUIScene from "./scenes/MainUIScene.ts";
import PauseScene from "./scenes/PauseScene.ts";
import AudioManager from "./managers/AudioManager.ts";
import EntityManager from "./managers/EntityManager.ts";
import SaveManager from "./managers/SaveManager.ts";

// Find out more information about the Game Config at:
// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Types.Core.GameConfig = {
    type: AUTO,
    width: 1080,
    height: 960,
    parent: 'game-container',
    backgroundColor: '#030712',
    scale: {
        mode: Scale.EXPAND,
        autoCenter: Scale.CENTER_BOTH
    },
    input: {
        // Use direct navigator.getGamepads() polling in GamepadUtils to avoid Phaser GamepadPlugin scene-transition bugs
        gamepad: false,
    },
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
        }
    },
    plugins: {
        global: [
            { key: SaveManager.PLUGIN_KEY, plugin: SaveManager, mapping: SaveManager.MAPPING_NAME },
            { key: AudioManager.PLUGIN_KEY, plugin: AudioManager, mapping: AudioManager.MAPPING_NAME }
        ],
        scene: [
            { key: EntityManager.PLUGIN_KEY, plugin: EntityManager, mapping: EntityManager.MAPPING_NAME }
        ]
    },
    scene: [
        HomeScene,
        MainGameScene,
        MainUIScene,
        LevelUpScene,
        PauseScene,
        GameOverScene
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    new Game(config);
});
