import { GameObjects, Input, Loader, Scenes } from "phaser";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";
import type { PlayerShipsData } from "../gameData/PlayerShipsData.ts";
import AudioManager from "../managers/AudioManager.ts";
import SaveManager from "../managers/SaveManager.ts";
import SaveConstants, { type LeaderboardEntry } from "../SaveConstants.ts";
import { GamepadEdgeTracker, isGamepadConnected } from "../utils/GamepadUtils.ts";
import { drawChamferPanel, renderLeaderboardRows } from "../utils/UITheme.ts";

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
    private _gamepadGroup?: GameObjects.Container;
    private _muteBtnText?: GameObjects.Text;
    private _muteBtnGfx?: GameObjects.Graphics;
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

        // Ambient deep space backdrop
        this.add.tileSprite(0, 0, width, height, 'bg')
            .setOrigin(0, 0)
            .setTileScale(2)
            .setAlpha(0.75);

        this.add.circle(width * 0.2, height * 0.24, 340, 0x4c1d95, 0.14);
        this.add.circle(width * 0.82, height * 0.56, 380, 0x0e7490, 0.12);

        const planet = this.add.image(width * 0.82, 290, 'planet')
            .setScale(0.62)
            .setAlpha(0.24)
            .setTint(0x38bdf8);
        this.tweens.add({
            targets: planet,
            y: 304,
            duration: 4200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        for (let i = 0; i < 85; i++) {
            const star = this.add.circle(
                Phaser.Math.Between(10, width - 10),
                Phaser.Math.Between(10, height - 10),
                Phaser.Math.FloatBetween(1, 2.8),
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

        // Top-left Best Score badge if recorded
        const bestScore = Number(this.saveManager?.getData(SaveConstants.Keys.PLAYER_BEST_SCORE) ?? 0);
        if (bestScore > 0) {
            const bestGfx = this.add.graphics();
            drawChamferPanel(bestGfx, 196, 68, 300, 48, {
                cut: 10,
                fillColor: 0x0b1324,
                fillAlpha: 0.88,
                strokeColor: 0xfacc15,
                strokeAlpha: 0.75,
                lineWidth: 2,
            });
            this.add.text(196, 68, `RECORD : ${bestScore.toLocaleString('fr-FR')} PTS`, {
                fontSize: '18px',
                fontFamily: 'future, sans-serif',
                color: '#fde047',
            }).setOrigin(0.5);
        }

        // Top-right quick mute button
        this._muteBtnGfx = this.add.graphics();
        const muteHit = this.add.rectangle(width - 130, 68, 172, 48, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        this._muteBtnText = this.add.text(width - 130, 68, 'SON ON', {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: '#4ade80',
        }).setOrigin(0.5);
        muteHit.on('pointerdown', () => {
            this.audioManager?.toggleMute();
            this.audioManager?.ensureMusicStarted();
            this.refreshMuteLabel();
        });
        this.refreshMuteLabel();

        // Hero Title & Subtitle Pill
        this.add.text(cx, 152, 'CODA HERO SHOOTER', {
            fontSize: '60px',
            color: '#38bdf8',
            fontFamily: 'future, sans-serif',
            stroke: '#020617',
            strokeThickness: 8,
            shadow: { offsetX: 0, offsetY: 0, color: '#0ea5e9', blur: 18, fill: true },
        }).setOrigin(0.5);

        const subGfx = this.add.graphics();
        drawChamferPanel(subGfx, cx, 214, 560, 38, {
            cut: 10,
            fillColor: 0x0c4a6e,
            fillAlpha: 0.45,
            strokeColor: 0x38bdf8,
            strokeAlpha: 0.6,
            lineWidth: 1.5,
        });
        this.add.text(cx, 214, 'ARCADE ROGUELITE  •  4 SECTEURS SPATIAUX', {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: '#bae6fd',
        }).setOrigin(0.5);

        // Hangar Header
        this.add.text(cx, 286, 'HANGAR — CHOISISSEZ VOTRE VAISSEAU  (← / →)', {
            fontSize: '21px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0.5);

        // 3-Ship Selector Cards with Stats
        this.buildShipSelector(cx, 466);

        // Primary Start CTA
        const ctaContainer = this.add.container(cx, 742);
        const ctaGfx = this.add.graphics();
        const drawCta = (hovered: boolean) => {
            ctaGfx.clear();
            drawChamferPanel(ctaGfx, 0, 0, 560, 92, {
                cut: 18,
                fillColor: hovered ? 0x0284c7 : 0x0369a1,
                fillAlpha: 0.96,
                strokeColor: hovered ? 0xe0f2fe : 0x7dd3fc,
                strokeAlpha: 1,
                lineWidth: 3,
                brackets: true,
                bracketLen: 16,
                bracketColor: 0x38bdf8,
            });
        };
        drawCta(false);

        const ctaText = this.add.text(0, 0, 'DÉMARRER LA MISSION  [ESPACE / A]', {
            fontSize: '25px',
            fontFamily: 'future, sans-serif',
            color: '#ffffff',
            stroke: '#020617',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const ctaHit = this.add.rectangle(0, 0, 560, 92, 0x000000, 0)
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

        // Tactical Controls Panel
        this.renderControlsPanel(cx, 916);

        // Leaderboard Panel
        this.renderLeaderboardPanel(cx, 1348);

        // Gamepad detected badge (bottom)
        this._gamepadGroup = this.add.container(cx, height - 72).setVisible(false);
        const gpGfx = this.add.graphics();
        drawChamferPanel(gpGfx, 0, 0, 320, 44, {
            cut: 10,
            fillColor: 0x064e3b,
            fillAlpha: 0.85,
            strokeColor: 0x4ade80,
            strokeAlpha: 0.9,
            lineWidth: 2,
        });
        const gpTxt = this.add.text(0, 0, 'MANETTE DÉTECTÉE', {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: '#86efac',
        }).setOrigin(0.5);
        this._gamepadGroup.add([gpGfx, gpTxt]);

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
        const cardW = 296;
        const cardH = 304;
        const spacing = 318;

        [1, 2, 3].forEach((shipId, index) => {
            const ship = shipsData[String(shipId)];
            const x = cx + (index - 1) * spacing;
            const container = this.add.container(x, cy);

            const frameGfx = this.add.graphics();
            const halo = this.add.circle(0, -72, 54, 0x38bdf8, 0.14);
            const sprite = this.add.image(0, -72, 'sprites', ship.texture)
                .setRotation(-Math.PI / 2)
                .setScale(1.15);

            const keyBadge = this.add.text(-cardW / 2 + 18, -cardH / 2 + 16, `[${shipId}]`, {
                fontSize: '16px',
                fontFamily: 'future, sans-serif',
                color: '#7dd3fc',
            }).setOrigin(0, 0);

            const nameTxt = this.add.text(0, -2, ship.name ?? `VAISSEAU ${shipId}`, {
                fontSize: '19px',
                fontFamily: 'future, sans-serif',
                color: '#f8fafc',
            }).setOrigin(0.5);

            // Mini Stat Bars from playerShips.json
            const hpRatio = Phaser.Math.Clamp((ship.maxHealth ?? 100) / 140, 0.15, 1);
            const spdRatio = Phaser.Math.Clamp((ship.movementSpeed ?? 0.6) / 0.8, 0.15, 1);
            const rof = ship.rateOfFire ?? 0.32;
            const dmg = ship.baseDamage ?? 1;
            const fireRatio = Phaser.Math.Clamp((dmg / rof) / 6, 0.15, 1);

            const stats: Array<{ label: string; ratio: number; color: number }> = [
                { label: 'COQUE', ratio: hpRatio, color: 0x4ade80 },
                { label: 'VITESSE', ratio: spdRatio, color: 0x38bdf8 },
                { label: 'FEU', ratio: fireRatio, color: 0xfacc15 },
            ];

            const statNodes: GameObjects.GameObject[] = [];
            stats.forEach((stat, sIdx) => {
                const sy = 42 + sIdx * 36;
                const lbl = this.add.text(-cardW / 2 + 22, sy, stat.label, {
                    fontSize: '14px',
                    fontFamily: 'future, sans-serif',
                    color: '#94a3b8',
                }).setOrigin(0, 0.5);

                const barW = 148;
                const barX = cardW / 2 - 22 - barW;
                const track = this.add.rectangle(barX, sy, barW, 12, 0x0f172a, 1)
                    .setOrigin(0, 0.5)
                    .setStrokeStyle(1, 0x334155, 0.9);
                const fill = this.add.rectangle(barX + 1, sy, (barW - 2) * stat.ratio, 8, stat.color, 0.95)
                    .setOrigin(0, 0.5);
                statNodes.push(lbl, track, fill);
            });

            const hit = this.add.rectangle(0, 0, cardW, cardH, 0x000000, 0)
                .setInteractive({ useHandCursor: true });

            hit.on('pointerdown', () => {
                if (this._inputReady) this.selectShip(shipId);
            });

            container.add([frameGfx, halo, sprite, keyBadge, nameTxt, ...statNodes, hit]);
            this._shipCards.push({ id: shipId, container, frameGfx, halo, sprite, width: cardW, height: cardH });
        });

        this._shipDescText = this.add.text(cx, cy + 190, '', {
            fontSize: '23px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
            stroke: '#020617',
            strokeThickness: 4,
        }).setOrigin(0.5);

        this.refreshShipSelector();
    }

    private renderControlsPanel(cx: number, cy: number) {
        const panelW = 920;
        const panelH = 172;
        const gfx = this.add.graphics();
        drawChamferPanel(gfx, cx, cy, panelW, panelH, {
            cut: 16,
            fillColor: 0x0b1324,
            fillAlpha: 0.84,
            strokeColor: 0x334155,
            strokeAlpha: 0.9,
            lineWidth: 2,
        });

        this.add.text(cx, cy - 56, 'SYSTÈMES DE VOL & COMMANDES', {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: '#7dd3fc',
        }).setOrigin(0.5);

        this.add.text(
            cx,
            cy + 14,
            'DÉPLACER : Flèches / ZQSD / Stick   •   DASH : SHIFT / Clic Droit / B ou LB\n' +
            'FRÔLER LES TIRS (GRAZE) : Charge l\'Overdrive   •   PAUSE : ESC / P / Start   •   SON : M',
            {
                fontSize: '19px',
                color: '#cbd5e1',
                align: 'center',
                lineSpacing: 14,
            }
        ).setOrigin(0.5);
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
                cut: 16,
                fillColor: isSelected ? 0x13223b : 0x0b1324,
                fillAlpha: isSelected ? 0.96 : 0.82,
                strokeColor: isSelected ? 0x38bdf8 : 0x475569,
                strokeAlpha: isSelected ? 1 : 0.7,
                lineWidth: isSelected ? 3 : 2,
                brackets: isSelected,
                bracketLen: 16,
                bracketColor: 0x7dd3fc,
            });

            if (isSelected) {
                card.sprite.setScale(1.28);
                card.halo.setAlpha(0.24).setScale(1.1);
                card.container.setScale(1.03);
            } else {
                card.sprite.setScale(1.06);
                card.halo.setAlpha(0.06).setScale(0.9);
                card.container.setScale(1);
            }
        }
    }

    update() {
        if (this._gamepadGroup) {
            this._gamepadGroup.setVisible(isGamepadConnected(this));
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
        const panelW = 920;
        const panelH = 510;
        const gfx = this.add.graphics();
        drawChamferPanel(gfx, cx, cy, panelW, panelH, {
            cut: 18,
            fillColor: 0x0b1324,
            fillAlpha: 0.9,
            strokeColor: 0x334155,
            strokeAlpha: 0.95,
            lineWidth: 2,
            brackets: true,
            bracketLen: 18,
            bracketColor: 0xfacc15,
        });

        this.add.text(cx, cy - 204, 'CLASSEMENT LOCAL  •  TOP 5', {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
        }).setOrigin(0.5);

        const entries = (this.saveManager?.getData(SaveConstants.Keys.LEADERBOARD) as LeaderboardEntry[] | undefined) ?? [];
        if (entries.length === 0) {
            this.add.text(cx, cy + 16, 'Aucun score enregistré pour le moment.\nLancez une partie et inscrivez votre nom au tableau !', {
                fontSize: '24px',
                color: '#94a3b8',
                align: 'center',
                lineSpacing: 12,
            }).setOrigin(0.5);
            return;
        }

        const container = this.add.container(0, 0);
        renderLeaderboardRows(this, container, cx, cy - 118, 844, 72, entries, 5);
    }

    private refreshMuteLabel() {
        if (!this._muteBtnText || !this._muteBtnGfx) return;
        const x = this.scale.width - 130;
        const y = 68;
        const muted = Boolean(this.audioManager?.muted);

        this._muteBtnGfx.clear();
        drawChamferPanel(this._muteBtnGfx, x, y, 172, 48, {
            cut: 10,
            fillColor: 0x0b1324,
            fillAlpha: 0.9,
            strokeColor: muted ? 0xf87171 : 0x4ade80,
            strokeAlpha: 0.85,
            lineWidth: 2,
        });

        if (muted) {
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
