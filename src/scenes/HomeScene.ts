import { GameObjects, Input, Loader, Scenes } from "phaser";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";
import type { PlayerShipsData } from "../gameData/PlayerShipsData.ts";
import AudioManager from "../managers/AudioManager.ts";
import SaveManager from "../managers/SaveManager.ts";
import SaveConstants, { type LeaderboardEntry } from "../SaveConstants.ts";
import { GamepadEdgeTracker, isGamepadConnected } from "../utils/GamepadUtils.ts";

type ShipCard = {
    id: number;
    bg: GameObjects.Rectangle;
    sprite: GameObjects.Image;
};

export default class HomeScene extends Phaser.Scene {
    private saveManager?: SaveManager;
    private audioManager?: AudioManager;
    private readonly _gamepadTracker = new GamepadEdgeTracker();
    private _gamepadStatusText?: GameObjects.Text;
    private _muteBtnText?: GameObjects.Text;
    private _shipCards: ShipCard[] = [];
    private _shipDescText?: GameObjects.Text;
    private _selectedShipId: number = 1;
    private _inputReady: boolean = false;
    private _starting: boolean = false;

    constructor() {
        super(GameConstants.SceneKeys.HOME);
    }

    preload() {
        const width: number = this.scale.width;
        const y: number = this.scale.height / 2;

        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(0, y, width, 64);
        this.load.on(Loader.Events.PROGRESS, function (value: number) {
            progressBar.clear();
            progressBar.fillStyle(0x38bdf8, 1);
            progressBar.fillRect(0, y, width * value, 64);
        });
        this.load.on(Loader.Events.COMPLETE, function () {
            progressBar.destroy();
            progressBox.destroy();
        });

        this.load.setPath('assets');

        this.load.image('bg', 'Backgrounds/darkPurple.png');
        this.load.image('planet', 'Planets/planet00.png');
        this.load.atlas('sprites', 'Spritesheet/gameSprites.png', 'Spritesheet/gameSprites.json');
        this.load.bitmapFont('future-bmp', 'Fonts/kenvector_future.png', 'Fonts/kenvector_future.xml');
        this.load.font('future', 'Fonts/kenvector_future.ttf');
        this.load.json('playerShips', 'Data/playerShips.json');
        this.load.json('enemies', 'Data/enemies.json');
        this.load.audio('bgm_scifi', 'Sounds/bgm_scifi.wav');
        this.load.audio('sfx_laser1', 'Sounds/sfx_laser1.ogg');
        this.load.audio('sfx_laser2', 'Sounds/sfx_laser2.ogg');
        this.load.audio('sfx_exp', 'Sounds/sfx_exp.wav');
        this.load.audio('sfx_powerup', 'Sounds/sfx_powerup.wav');
        this.load.audio('sfx_levelup', 'Sounds/sfx_levelup.wav');
        this.load.audio('sfx_hit', 'Sounds/sfx_hit.wav');
        this.load.audio('sfx_dash', 'Sounds/sfx_dash.wav');
        this.load.audio('sfx_overdrive', 'Sounds/sfx_overdrive.wav');
        this.load.audio('sfx_boss_alert', 'Sounds/sfx_boss_alert.wav');
    }

    create() {
        this._inputReady = false;
        this._starting = false;
        this._shipCards = [];
        this._selectedShipId = Number(this.registry.get(RegistryConstants.Keys.SELECTED_SHIP_ID) ?? 1);
        this._gamepadTracker.reset(this);

        this.saveManager = this.game.plugins.get(SaveManager.PLUGIN_KEY) as SaveManager | undefined;
        this.saveManager?.load();

        this.audioManager = this.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
        this.audioManager?.initSettingsFromSave();
        this.audioManager?.ensureMusicStarted();

        const width = this.scale.width;
        const height = this.scale.height;

        this.add.tileSprite(0, 0, width, height, 'bg')
            .setOrigin(0, 0)
            .setTileScale(2)
            .setAlpha(0.75);

        for (let i = 0; i < 70; i++) {
            this.add.circle(
                Phaser.Math.Between(10, width - 10),
                Phaser.Math.Between(10, height - 10),
                Phaser.Math.FloatBetween(1, 2.8),
                0xbae6fd,
                Phaser.Math.FloatBetween(0.25, 0.85)
            );
        }

        // Quick mute button in top-right
        const muteBg = this.add.rectangle(width - 48, 48, 170, 50, 0x0f172a, 0.85)
            .setOrigin(1, 0)
            .setStrokeStyle(2, 0x38bdf8, 0.8)
            .setInteractive({ useHandCursor: true });
        this._muteBtnText = this.add.text(width - 133, 73, 'SON ON', {
            fontSize: '22px',
            fontFamily: 'future, sans-serif',
            color: '#4ade80',
        }).setOrigin(0.5);
        muteBg.on('pointerdown', () => {
            this.audioManager?.toggleMute();
            this.audioManager?.ensureMusicStarted();
            this.refreshMuteLabel();
        });
        this.refreshMuteLabel();

        // Title
        this.add.text(width / 2, 185, 'CODA HERO SHOOTER', {
            fontSize: '64px',
            color: '#38bdf8',
            fontFamily: 'future, sans-serif',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5);

        this.add.text(width / 2, 245, 'CHOISISSEZ VOTRE VAISSEAU  (← / →)', {
            fontSize: '24px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0.5);

        // 3-Ship Hero Selector
        this.buildShipSelector(width / 2, 415);

        // Start button
        const startBg = this.add.rectangle(width / 2, 685, 520, 96, 0x0ea5e9, 0.92)
            .setStrokeStyle(4, 0x7dd3fc, 1)
            .setInteractive({ useHandCursor: true });
        this.add.text(width / 2, 685, 'JOUER  [ESPACE / A]', {
            fontSize: '34px',
            fontFamily: 'future, sans-serif',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);

        startBg.on('pointerover', () => startBg.setFillStyle(0x38bdf8, 1));
        startBg.on('pointerout', () => startBg.setFillStyle(0x0ea5e9, 0.92));
        startBg.on('pointerdown', () => {
            if (this._inputReady) this.startGame();
        });

        this.add.text(
            width / 2,
            825,
            'Bouger : Flèches / ZQSD / Stick  •  Dash : SHIFT / Clic Droit / B ou LB\nFrôlez les tirs (GRAZE) pour charger la SURCHARGE OVERDRIVE !\nPause : ESC / P / Start  •  Son : M',
            {
                fontSize: '22px',
                color: '#cbd5e1',
                align: 'center',
                lineSpacing: 10,
            }
        ).setOrigin(0.5);

        // Leaderboard Panel
        this.renderLeaderboardPanel(width / 2, 1230);

        // Gamepad detected badge
        this._gamepadStatusText = this.add.text(width / 2, height - 80, 'MANETTE DÉTECTÉE', {
            fontSize: '24px',
            fontFamily: 'future, sans-serif',
            color: '#4ade80',
        }).setOrigin(0.5).setVisible(false);

        this.game.events.on(GameConstants.Events.AUDIO_CHANGED_EVENT, this.refreshMuteLabel, this);
        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameConstants.Events.AUDIO_CHANGED_EVENT, this.refreshMuteLabel, this);
        }, this);

        this.time.delayedCall(200, () => {
            this._gamepadTracker.reset(this);
            this._inputReady = true;
        });

        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            if (!this._inputReady || event.repeat) return;

            if (event.keyCode === Input.Keyboard.KeyCodes.LEFT || event.keyCode === Input.Keyboard.KeyCodes.A || event.keyCode === Input.Keyboard.KeyCodes.Q) {
                this.cycleShip(-1);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.RIGHT || event.keyCode === Input.Keyboard.KeyCodes.D) {
                this.cycleShip(1);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.ONE) {
                this.selectShip(1);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.TWO) {
                this.selectShip(2);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.THREE) {
                this.selectShip(3);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.SPACE || event.keyCode === Input.Keyboard.KeyCodes.ENTER) {
                this.startGame();
            } else if (event.keyCode === Input.Keyboard.KeyCodes.M) {
                this.audioManager?.toggleMute();
                this.refreshMuteLabel();
            }
        });

        console.log("HomeScene created");
    }

    private buildShipSelector(cx: number, cy: number) {
        const shipsData = this.cache.json.get('playerShips') as PlayerShipsData;
        const cardW = 280;
        const cardH = 220;
        const spacing = 305;

        [1, 2, 3].forEach((shipId, index) => {
            const ship = shipsData[String(shipId)];
            const x = cx + (index - 1) * spacing;

            const bg = this.add.rectangle(x, cy, cardW, cardH, 0x0f172a, 0.9)
                .setStrokeStyle(3, 0x475569, 0.8)
                .setInteractive({ useHandCursor: true });

            const sprite = this.add.image(x, cy - 28, 'sprites', ship.texture)
                .setRotation(-Math.PI / 2)
                .setScale(1.15);

            this.add.text(x, cy + 68, ship.name ?? `VAISSEAU ${shipId}`, {
                fontSize: '20px',
                fontFamily: 'future, sans-serif',
                color: '#f8fafc',
            }).setOrigin(0.5);

            bg.on('pointerdown', () => {
                if (this._inputReady) this.selectShip(shipId);
            });

            this._shipCards.push({ id: shipId, bg, sprite });
        });

        this._shipDescText = this.add.text(cx, cy + 150, '', {
            fontSize: '26px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
        }).setOrigin(0.5);

        this.refreshShipSelector();
    }

    private cycleShip(delta: number) {
        const next = ((this._selectedShipId - 1 + delta + 3) % 3) + 1;
        this.selectShip(next);
    }

    private selectShip(id: number) {
        this._selectedShipId = id;
        this.registry.set(RegistryConstants.Keys.SELECTED_SHIP_ID, id);
        this.audioManager?.playSfx('sfx_exp', 0.4);
        this.refreshShipSelector();
    }

    private refreshShipSelector() {
        const shipsData = this.cache.json.get('playerShips') as PlayerShipsData;
        const selected = shipsData[String(this._selectedShipId)];
        this._shipDescText?.setText(selected?.description ?? '');

        for (const card of this._shipCards) {
            const isSelected = card.id === this._selectedShipId;
            if (isSelected) {
                card.bg.setFillStyle(0x1e293b, 1).setStrokeStyle(4, 0x38bdf8, 1);
                card.sprite.setScale(1.3);
            } else {
                card.bg.setFillStyle(0x0f172a, 0.85).setStrokeStyle(2, 0x475569, 0.7);
                card.sprite.setScale(1.05);
            }
        }
    }

    update() {
        if (this._gamepadStatusText) {
            this._gamepadStatusText.setVisible(isGamepadConnected(this));
        }

        if (!this._inputReady || this._starting) return;

        const pad = this._gamepadTracker.poll(this);
        if (pad.left) this.cycleShip(-1);
        if (pad.right) this.cycleShip(1);
        if (pad.confirm || pad.pause) {
            this.startGame();
        }
    }

    private renderLeaderboardPanel(cx: number, cy: number) {
        const panelW = 840;
        const panelH = 460;
        this.add.rectangle(cx, cy, panelW, panelH, 0x0f172a, 0.88)
            .setStrokeStyle(3, 0x334155, 0.9);

        this.add.text(cx, cy - 185, 'CLASSEMENT LOCAL (TOP 5)', {
            fontSize: '30px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
        }).setOrigin(0.5);

        const entries = (this.saveManager?.getData(SaveConstants.Keys.LEADERBOARD) as LeaderboardEntry[] | undefined) ?? [];
        if (entries.length === 0) {
            this.add.text(cx, cy + 20, 'Aucun score enregistré pour le moment.\nLancez une partie et notez votre score !', {
                fontSize: '26px',
                color: '#94a3b8',
                align: 'center',
                lineSpacing: 12,
            }).setOrigin(0.5);
            return;
        }

        const top = entries.slice(0, 5);
        top.forEach((entry, idx) => {
            const rowY = cy - 110 + idx * 64;
            const color = idx === 0 ? '#fde047' : idx === 1 ? '#e2e8f0' : idx === 2 ? '#fdba74' : '#94a3b8';

            this.add.text(cx - 360, rowY, `#${idx + 1}  ${entry.name}`, {
                fontSize: '28px',
                fontFamily: 'future, sans-serif',
                color,
            }).setOrigin(0, 0.5);

            this.add.text(cx + 120, rowY, `LVL ${entry.level}`, {
                fontSize: '24px',
                fontFamily: 'future, sans-serif',
                color: '#38bdf8',
            }).setOrigin(0.5);

            this.add.text(cx + 360, rowY, `${entry.score} PTS`, {
                fontSize: '28px',
                fontFamily: 'future, sans-serif',
                color,
            }).setOrigin(1, 0.5);
        });
    }

    private refreshMuteLabel() {
        if (!this._muteBtnText) return;
        if (this.audioManager?.muted) {
            this._muteBtnText.setText('SON OFF').setColor('#f87171');
        } else {
            this._muteBtnText.setText('SON ON').setColor('#4ade80');
        }
    }

    private startGame() {
        if (this._starting) return;
        this._starting = true;
        this.registry.set(RegistryConstants.Keys.SELECTED_SHIP_ID, this._selectedShipId);
        this.audioManager?.ensureMusicStarted();
        this.scene.launch(GameConstants.SceneKeys.MAIN_UI);
        this.scene.start(GameConstants.SceneKeys.MAIN_GAME);
    }
}
