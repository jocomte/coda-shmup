import { GameObjects, Input, Loader, Scale, Scenes } from "phaser";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";
import type { PlayerShipsData } from "../gameData/PlayerShipsData.ts";
import AudioManager from "../managers/AudioManager.ts";
import SaveManager from "../managers/SaveManager.ts";
import SaveConstants, { type LeaderboardEntry } from "../SaveConstants.ts";
import { GamepadEdgeTracker, isGamepadConnected } from "../utils/GamepadUtils.ts";
import { createSettingsIconButton, drawChamferPanel, renderLeaderboardRows } from "../utils/UITheme.ts";

type ShipCard = {
    id: number;
    container: GameObjects.Container;
    frameGfx: GameObjects.Graphics;
    halo: GameObjects.Arc;
    sprite: GameObjects.Image;
    width: number;
    height: number;
};

export default class HomeScene extends Phaser.Scene {
    private saveManager?: SaveManager;
    private audioManager?: AudioManager;
    private readonly _gamepadTracker = new GamepadEdgeTracker();
    private _gamepadText?: GameObjects.Text;
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
        progressBox.fillStyle(0x0f172a, 0.9);
        progressBox.fillRect(140, y - 24, width - 280, 48);
        progressBox.lineStyle(2, 0x38bdf8, 0.7);
        progressBox.strokeRect(140, y - 24, width - 280, 48);

        this.load.on(Loader.Events.PROGRESS, function (value: number) {
            progressBar.clear();
            progressBar.fillStyle(0x38bdf8, 1);
            progressBar.fillRect(146, y - 18, (width - 292) * value, 36);
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
        const cx = width / 2;
        const isWide = width >= 1320;
        const isCompact = !isWide && height < 1180;

        // Ambient deep space backdrop
        this.add.tileSprite(0, 0, width, height, 'bg')
            .setOrigin(0, 0)
            .setTileScale(2)
            .setAlpha(0.75);

        this.add.circle(width * 0.2, height * 0.26, 320, 0x4c1d95, 0.14);
        this.add.circle(width * 0.82, height * 0.62, 340, 0x0e7490, 0.12);

        const planet = this.add.image(width * 0.84, height * 0.25, 'planet')
            .setScale(0.55)
            .setAlpha(0.22)
            .setTint(0x38bdf8);
        this.tweens.add({
            targets: planet,
            y: height * 0.25 + 14,
            duration: 4200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        for (let i = 0; i < 80; i++) {
            const star = this.add.circle(
                Phaser.Math.Between(10, width - 10),
                Phaser.Math.Between(10, height - 10),
                Phaser.Math.FloatBetween(1, 2.6),
                i % 3 === 0 ? 0xe0f2fe : 0xbae6fd,
                Phaser.Math.FloatBetween(0.25, 0.85)
            );
            if (i % 4 === 0) {
                this.tweens.add({
                    targets: star,
                    alpha: 0.15,
                    duration: Phaser.Math.Between(1300, 2600),
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                });
            }
        }

        // Top-left minimal Record text (only if set)
        const bestScore = Number(this.saveManager?.getData(SaveConstants.Keys.PLAYER_BEST_SCORE) ?? 0);
        if (bestScore > 0) {
            this.add.text(36, 46, `RECORD : ${bestScore.toLocaleString('fr-FR')} PTS`, {
                fontSize: '19px',
                fontFamily: 'future, sans-serif',
                color: '#fde047',
                stroke: '#020617',
                strokeThickness: 4,
            }).setOrigin(0, 0.5);
        }

        // Top-right Settings Gear Icon Button
        createSettingsIconButton(this, width - 54, 52, 50, () => {
            if (!this._inputReady || this._starting) return;
            this.openSettings();
        });

        // Header
        const titleY = isWide ? 82 : isCompact ? 76 : 138;
        this.add.text(cx, titleY, 'CODA HERO SHOOTER', {
            fontSize: isWide ? '54px' : isCompact ? '50px' : '58px',
            color: '#38bdf8',
            fontFamily: 'future, sans-serif',
            stroke: '#020617',
            strokeThickness: 8,
            shadow: { offsetX: 0, offsetY: 0, color: '#0ea5e9', blur: 18, fill: true },
        }).setOrigin(0.5);

        this.add.text(cx, titleY + 50, 'ARCADE ROGUELITE  •  4 SECTEURS SPATIAUX', {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: '#bae6fd',
        }).setOrigin(0.5);

        // Responsive Column vs Stacked Layout
        const heroCx = isWide ? width * 0.34 : cx;
        const shipY = isWide ? 338 : isCompact ? 278 : 395;
        const cardW = isWide ? 248 : isCompact ? 268 : 286;
        const cardH = isWide ? 222 : isCompact ? 196 : 232;
        const spacing = cardW + (isWide ? 20 : 24);
        this.buildShipSelector(heroCx, shipY, cardW, cardH, spacing);

        const ctaY = isWide ? 580 : isCompact ? 476 : 655;
        const ctaW = isWide ? 500 : 520;
        const ctaH = isCompact ? 78 : 88;
        this.buildStartButton(heroCx, ctaY, ctaW, ctaH);

        const controlsY = isWide ? 690 : isCompact ? 558 : 770;
        this.add.text(
            heroCx,
            controlsY,
            'ZQSD / Stick : Piloter  •  Shift / Clic Droit / B : Dash\nFrôler les tirs : Overdrive  •  ESC / Start : Pause',
            {
                fontSize: isWide ? '18px' : isCompact ? '17px' : '20px',
                color: '#cbd5e1',
                align: 'center',
                lineSpacing: 10,
            }
        ).setOrigin(0.5);

        if (isWide) {
            const lbW = Math.min(580, width * 0.38);
            this.renderLeaderboardPanel(width * 0.77, 515, lbW, 540, 5, 72);
        } else if (isCompact) {
            this.renderLeaderboardPanel(cx, 745, 860, 290, 3, 60);
        } else {
            this.renderLeaderboardPanel(cx, Math.min(height - 320, 1180), 880, 490, 5, 68);
        }

        // Gamepad detected indicator (bottom)
        this._gamepadText = this.add.text(cx, height - 32, 'MANETTE DÉTECTÉE', {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: '#4ade80',
            stroke: '#020617',
            strokeThickness: 3,
        }).setOrigin(0.5).setVisible(false);

        const onResume = () => {
            this._gamepadTracker.reset(this);
        };
        const onResize = () => {
            if (!this._starting && this.scene.isActive(GameConstants.SceneKeys.HOME)) {
                this.scene.restart();
            }
        };
        this.scale.on(Scale.Events.RESIZE, onResize, this);
        this.events.on(Scenes.Events.RESUME, onResume, this);
        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.scale.off(Scale.Events.RESIZE, onResize, this);
            this.events.off(Scenes.Events.RESUME, onResume, this);
        }, this);

        this.time.delayedCall(200, () => {
            this._gamepadTracker.reset(this);
            this._inputReady = true;
        });

        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            if (!this._inputReady || this._starting || event.repeat) return;

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
            }
        });

        console.log("HomeScene created");
    }

    private buildStartButton(cx: number, cy: number, w: number, h: number) {
        const ctaContainer = this.add.container(cx, cy);
        const ctaGfx = this.add.graphics();
        const drawCta = (hovered: boolean) => {
            ctaGfx.clear();
            drawChamferPanel(ctaGfx, 0, 0, w, h, {
                cut: 16,
                fillColor: hovered ? 0x0284c7 : 0x0369a1,
                fillAlpha: 0.96,
                strokeColor: hovered ? 0xe0f2fe : 0x7dd3fc,
                strokeAlpha: 1,
                lineWidth: 2.5,
                brackets: true,
                bracketLen: 14,
                bracketColor: 0x38bdf8,
            });
        };
        drawCta(false);

        const ctaText = this.add.text(0, 0, 'JOUER  [ESPACE / A]', {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#ffffff',
            stroke: '#020617',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const ctaHit = this.add.rectangle(0, 0, w, h, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        ctaContainer.add([ctaGfx, ctaText, ctaHit]);

        this.tweens.add({
            targets: ctaContainer,
            scale: { from: 1, to: 1.02 },
            duration: 1300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        ctaHit.on('pointerover', () => drawCta(true));
        ctaHit.on('pointerout', () => drawCta(false));
        ctaHit.on('pointerdown', () => {
            if (this._inputReady) this.startGame();
        });
    }

    private openSettings() {
        if (this.scene.isActive(GameConstants.SceneKeys.PAUSE)) return;
        this.scene.pause(GameConstants.SceneKeys.HOME);
        this.scene.launch(GameConstants.SceneKeys.PAUSE, { mode: 'settings' });
    }

    private buildShipSelector(cx: number, cy: number, cardW: number, cardH: number, spacing: number) {
        const shipsData = this.cache.json.get('playerShips') as PlayerShipsData;

        [1, 2, 3].forEach((shipId, index) => {
            const ship = shipsData[String(shipId)];
            const x = cx + (index - 1) * spacing;
            const container = this.add.container(x, cy);

            const frameGfx = this.add.graphics();
            const halo = this.add.circle(0, -24, 48, 0x38bdf8, 0.14);
            const sprite = this.add.image(0, -24, 'sprites', ship.texture)
                .setRotation(-Math.PI / 2)
                .setScale(1.1);

            const keyBadge = this.add.text(-cardW / 2 + 14, -cardH / 2 + 12, `[${shipId}]`, {
                fontSize: '15px',
                fontFamily: 'future, sans-serif',
                color: '#7dd3fc',
            }).setOrigin(0, 0);

            const nameTxt = this.add.text(0, cardH / 2 - 48, ship.name ?? `VAISSEAU ${shipId}`, {
                fontSize: cardW < 260 ? '16px' : '18px',
                fontFamily: 'future, sans-serif',
                color: '#f8fafc',
            }).setOrigin(0.5);

            const statSummary = this.add.text(0, cardH / 2 - 22, `${ship.maxHealth ?? 100} PV  •  DÉGÂTS ${ship.baseDamage ?? 1}`, {
                fontSize: '14px',
                fontFamily: 'future, sans-serif',
                color: '#94a3b8',
            }).setOrigin(0.5);

            const hit = this.add.rectangle(0, 0, cardW, cardH, 0x000000, 0)
                .setInteractive({ useHandCursor: true });

            hit.on('pointerdown', () => {
                if (this._inputReady) this.selectShip(shipId);
            });

            container.add([frameGfx, halo, sprite, keyBadge, nameTxt, statSummary, hit]);
            this._shipCards.push({ id: shipId, container, frameGfx, halo, sprite, width: cardW, height: cardH });
        });

        this._shipDescText = this.add.text(cx, cy + cardH / 2 + 34, '', {
            fontSize: '21px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
            stroke: '#020617',
            strokeThickness: 4,
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
            card.frameGfx.clear();
            drawChamferPanel(card.frameGfx, 0, 0, card.width, card.height, {
                cut: 14,
                fillColor: isSelected ? 0x13223b : 0x0b1324,
                fillAlpha: isSelected ? 0.96 : 0.8,
                strokeColor: isSelected ? 0x38bdf8 : 0x475569,
                strokeAlpha: isSelected ? 1 : 0.65,
                lineWidth: isSelected ? 3 : 1.5,
                brackets: isSelected,
                bracketLen: 14,
                bracketColor: 0x7dd3fc,
            });

            if (isSelected) {
                card.sprite.setScale(1.22);
                card.halo.setAlpha(0.22).setScale(1.06);
                card.container.setScale(1.03);
            } else {
                card.sprite.setScale(1.02);
                card.halo.setAlpha(0.06).setScale(0.9);
                card.container.setScale(1);
            }
        }
    }

    update() {
        if (this._gamepadText) {
            this._gamepadText.setVisible(isGamepadConnected(this));
        }

        if (!this._inputReady || this._starting) return;

        const pad = this._gamepadTracker.poll(this);
        if (pad.left) this.cycleShip(-1);
        if (pad.right) this.cycleShip(1);
        if (pad.confirm || pad.pause) {
            this.startGame();
        }
    }

    private renderLeaderboardPanel(cx: number, cy: number, panelW: number, panelH: number, maxRows: number, rowStep: number) {
        const gfx = this.add.graphics();
        drawChamferPanel(gfx, cx, cy, panelW, panelH, {
            cut: 16,
            fillColor: 0x0b1324,
            fillAlpha: 0.88,
            strokeColor: 0x334155,
            strokeAlpha: 0.9,
            lineWidth: 2,
            brackets: true,
            bracketLen: 16,
            bracketColor: 0xfacc15,
        });

        this.add.text(cx, cy - panelH / 2 + 44, `CLASSEMENT LOCAL  •  TOP ${maxRows}`, {
            fontSize: '23px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
        }).setOrigin(0.5);

        const entries = (this.saveManager?.getData(SaveConstants.Keys.LEADERBOARD) as LeaderboardEntry[] | undefined) ?? [];
        if (entries.length === 0) {
            this.add.text(cx, cy + 12, 'Aucun score enregistré.\nLancez une partie pour figurer ici !', {
                fontSize: '21px',
                color: '#94a3b8',
                align: 'center',
                lineSpacing: 10,
                wordWrap: { width: panelW - 60 },
            }).setOrigin(0.5);
            return;
        }

        const container = this.add.container(0, 0);
        const firstRowY = cy - panelH / 2 + 114;
        renderLeaderboardRows(this, container, cx, firstRowY, panelW - 56, rowStep, entries, maxRows);
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
