import { GameObjects, Scene, Scenes } from 'phaser';
import Health from "../components/Health.ts";
import Player from "../entities/Player.ts";
import { getMapZoneForSector, type MapZoneConfig } from "../gameData/MapZonesData.ts";
import RegistryConstants from "../RegistryConstants.ts";
import SaveManager from "../managers/SaveManager.ts";
import AudioManager from "../managers/AudioManager.ts";
import SaveConstants from "../SaveConstants.ts";
import EntityManager from "../managers/EntityManager.ts";
import GameConstants from "../GameConstants.ts";
import { GamepadEdgeTracker } from "../utils/GamepadUtils.ts";

export default class MainGameScene extends Scene {
    private saveManager: SaveManager;
    private audioManager: AudioManager;
    private entityManager: EntityManager;
    private readonly _gamepadTracker = new GamepadEdgeTracker();
    private _player?: Player;
    private _bgTile?: GameObjects.TileSprite;
    private _nebulaCircles: Array<{ outer: GameObjects.Arc; inner: GameObjects.Arc }> = [];
    private _planetImages: GameObjects.Image[] = [];
    private _starCircles: GameObjects.Arc[] = [];
    private _arenaGraphics?: GameObjects.Graphics;
    private _mapWidth: number = GameConstants.MAP_WIDTH;
    private _mapHeight: number = GameConstants.MAP_HEIGHT;

    constructor() {
        super(GameConstants.SceneKeys.MAIN_GAME);
    }

    // noinspection JSUnusedGlobalSymbols
    create() {
        if (!this.saveManager) {
            console.error('SaveManager plugin not found');
        }
        this.saveManager?.load();

        this.audioManager = this.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager;
        this.audioManager?.initSettingsFromSave();
        this.audioManager?.ensureMusicStarted();

        this.input.mouse?.disableContextMenu();
        this._gamepadTracker.reset(this);

        const mapWidth = GameConstants.MAP_WIDTH;
        const mapHeight = GameConstants.MAP_HEIGHT;

        this.physics.world.setBounds(0, 0, mapWidth, mapHeight);
        this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);

        this.createSpaceEnvironment(mapWidth, mapHeight);

        if (!this.entityManager) {
            console.error('EntityManager plugin not found');
        }

        const player = this.entityManager.initAndSpawnPlayer();
        this._player = player;
        this.registry.set(RegistryConstants.Keys.PLAYER_SCORE, 0);
        this.registry.set(RegistryConstants.Keys.PLAYER_LEVEL, player.level);

        player.getComponent(Health)?.once(Health.DEATH_EVENT, () => {
            // Hide the player and let its explosion play before showing the game over screen
            player.disableBody(true, true);
            this.time.delayedCall(1000, this.endGame, [], this);
        }, this);

        const onLevelUp = (level: number) => {
            this.registry.set(RegistryConstants.Keys.PLAYER_LEVEL, level);
            this.openLevelUpModal(player);
        };
        const onResume = () => {
            this._gamepadTracker.reset(this);
        };
        const onSectorChanged = (payload: { sectorNumber: number; zone: MapZoneConfig; isWarp?: boolean }) => {
            this.applyZoneTheme(payload.zone, Boolean(payload.isWarp));
        };
        this.game.events.on(GameConstants.Events.LEVEL_UP_EVENT, onLevelUp, this);
        this.game.events.on(GameConstants.Events.SECTOR_CHANGED_EVENT, onSectorChanged, this);
        this.events.on(Scenes.Events.RESUME, onResume, this);
        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameConstants.Events.LEVEL_UP_EVENT, onLevelUp, this);
            this.game.events.off(GameConstants.Events.SECTOR_CHANGED_EVENT, onSectorChanged, this);
            this.events.off(Scenes.Events.RESUME, onResume, this);
        }, this);

        this.cameras.main.startFollow(player, true, 0.12, 0.12);

        this.entityManager.initEnemies();
        this.entityManager.initGroupCollisions();

        if (this.input.keyboard) {
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R).on('down', () => this.scene.restart());
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => this.openPauseModal());
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P).on('down', () => this.openPauseModal());
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M).on('down', () => this.audioManager?.toggleMute());
        } else {
            console.error('No keyboard input');
        }

        console.log("MainGameScene created");
    }

    public openPauseModal() {
        if (!this._player?.active) return;
        if (this.scene.isPaused(GameConstants.SceneKeys.MAIN_GAME)) return;
        if (this.scene.isActive(GameConstants.SceneKeys.LEVEL_UP) || this.scene.isActive(GameConstants.SceneKeys.PAUSE)) return;

        this.scene.pause(GameConstants.SceneKeys.MAIN_GAME);
        this.scene.launch(GameConstants.SceneKeys.PAUSE);
    }

    private createSpaceEnvironment(mapWidth: number, mapHeight: number) {
        this._mapWidth = mapWidth;
        this._mapHeight = mapHeight;
        this._nebulaCircles = [];
        this._planetImages = [];
        this._starCircles = [];

        const initialZone = getMapZoneForSector(1);

        // Base tiled space backdrop
        this._bgTile = this.add.tileSprite(0, 0, mapWidth, mapHeight, 'bg')
            .setOrigin(0, 0)
            .setTileScale(2)
            .setAlpha(0.75)
            .setDepth(0);

        // Soft glowing space nebulae clouds across the arena
        for (let i = 0; i < 12; i++) {
            const nx = Phaser.Math.Between(250, mapWidth - 250);
            const ny = Phaser.Math.Between(250, mapHeight - 250);
            const radius = Phaser.Math.Between(260, 520);
            const color = initialZone.nebulaColors[i % initialZone.nebulaColors.length];
            const outer = this.add.circle(nx, ny, radius, color, 0.08).setDepth(0);
            const inner = this.add.circle(nx + 40, ny - 30, radius * 0.6, color, 0.06).setDepth(0);
            this._nebulaCircles.push({ outer, inner });
        }

        // Distant planets/moons as visual landmarks in the arena
        const p1 = this.add.image(mapWidth * 0.28, mapHeight * 0.25, 'planet')
            .setScale(0.9)
            .setAlpha(0.45)
            .setDepth(1);
        const p2 = this.add.image(mapWidth * 0.74, mapHeight * 0.72, 'planet')
            .setScale(0.55)
            .setTint(0x38bdf8)
            .setAlpha(0.32)
            .setDepth(1);
        this._planetImages.push(p1, p2);

        // Twinkling starfield scattered across the arena
        for (let i = 0; i < 180; i++) {
            const sx = Phaser.Math.Between(30, mapWidth - 30);
            const sy = Phaser.Math.Between(30, mapHeight - 30);
            const radius = Phaser.Math.FloatBetween(1.2, 3.2);
            const alpha = Phaser.Math.FloatBetween(0.25, 0.85);
            const star = this.add.circle(sx, sy, radius, initialZone.starColors[i % initialZone.starColors.length], alpha).setDepth(1);
            this._starCircles.push(star);

            if (i % 5 === 0) {
                this.tweens.add({
                    targets: star,
                    alpha: 0.12,
                    duration: Phaser.Math.Between(1200, 2600),
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                });
            }
        }

        this._arenaGraphics = this.add.graphics().setDepth(2);
        this.applyZoneTheme(initialZone, false);
    }

    private applyZoneTheme(zone: MapZoneConfig, isWarp: boolean) {
        if (isWarp) {
            this.cameras.main.flash(450, 56, 189, 248);
        }

        this._bgTile?.setTint(zone.bgTint);

        for (let i = 0; i < this._nebulaCircles.length; i++) {
            const color = zone.nebulaColors[i % zone.nebulaColors.length];
            this._nebulaCircles[i].outer.setFillStyle(color, 0.08);
            this._nebulaCircles[i].inner.setFillStyle(color, 0.06);
        }

        if (this._planetImages[0]) {
            this._planetImages[0].setTint(zone.planetTint);
        }
        if (this._planetImages[1]) {
            this._planetImages[1].setTint(zone.gridColor);
        }

        for (let i = 0; i < this._starCircles.length; i++) {
            this._starCircles[i].setFillStyle(zone.starColors[i % zone.starColors.length], this._starCircles[i].alpha);
        }

        this.drawArenaBounds(zone);
    }

    private drawArenaBounds(zone: MapZoneConfig) {
        const graphics = this._arenaGraphics;
        if (!graphics) return;

        const mapWidth = this._mapWidth;
        const mapHeight = this._mapHeight;
        graphics.clear();

        // Subtle tactical sector grid for clear spatial movement feedback
        graphics.lineStyle(2, zone.gridColor, 0.14);
        const gridSize = 240;
        for (let x = gridSize; x < mapWidth; x += gridSize) {
            graphics.lineBetween(x, 0, x, mapHeight);
        }
        for (let y = gridSize; y < mapHeight; y += gridSize) {
            graphics.lineBetween(0, y, mapWidth, y);
        }

        // Glowing intersection markers
        graphics.fillStyle(zone.gridColor, 0.28);
        for (let x = gridSize; x < mapWidth; x += gridSize) {
            for (let y = gridSize; y < mapHeight; y += gridSize) {
                graphics.fillCircle(x, y, 4);
            }
        }

        // Double-layered neon energy barrier around the map perimeter
        graphics.lineStyle(18, zone.borderOuterColor, 0.25);
        graphics.strokeRect(10, 10, mapWidth - 20, mapHeight - 20);
        graphics.lineStyle(6, zone.borderInnerColor, 0.9);
        graphics.strokeRect(10, 10, mapWidth - 20, mapHeight - 20);
    }

    private openLevelUpModal(player: Player) {
        if (!player.active) return;
        if (this.scene.isActive(GameConstants.SceneKeys.LEVEL_UP)) return;
        if (this.scene.isActive(GameConstants.SceneKeys.PAUSE)) {
            this.scene.stop(GameConstants.SceneKeys.PAUSE);
        }

        if (!this.scene.isPaused(GameConstants.SceneKeys.MAIN_GAME)) {
            this.scene.pause(GameConstants.SceneKeys.MAIN_GAME);
        }
        this.scene.launch(GameConstants.SceneKeys.LEVEL_UP, { player });
    }

    private endGame() {
        const bestScore: number = Number(this.saveManager.getData(SaveConstants.Keys.PLAYER_BEST_SCORE) ?? 0);
        const currentScore: number = Number(this.registry.get(RegistryConstants.Keys.PLAYER_SCORE) ?? 0);
        if (currentScore > bestScore) {
            this.saveManager.setData(SaveConstants.Keys.PLAYER_BEST_SCORE, currentScore);
            console.log("New Best Score: " + currentScore);
        }

        this.registry.set(RegistryConstants.Keys.PLAYER_LEVEL, this._player?.level ?? 1);
        this.scene.start(GameConstants.SceneKeys.GAME_OVER);
    }

    update(_timeSinceLaunch: number, _deltaTime: number) {
        const pad = this._gamepadTracker.poll(this);
        if (pad.pause) {
            this.openPauseModal();
        }
    }
}
