import { GameObjects, Scenes, Scene } from "phaser";
import Health from "../components/Health.ts";
import Player, {
    type ActivePowerUpStatus,
    type ComboStatus,
    type DashStatus,
    type ExpStatus,
    type OverdriveStatus,
} from "../entities/Player.ts";
import { getMapZoneForSector, type MapZoneConfig } from "../gameData/MapZonesData.ts";
import AudioManager from "../managers/AudioManager.ts";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";
import { isGamepadConnected } from "../utils/GamepadUtils.ts";
import type MainGameScene from "./MainGameScene.ts";

type RadarSnapshot = {
    player: { nx: number; ny: number };
    enemies: Array<{ nx: number; ny: number; isBoss?: boolean }>;
    powerUps: Array<{ nx: number; ny: number }>;
};

type BossStatus = {
    active: boolean;
    name: string;
    current: number;
    max: number;
};

type SectorChangedPayload = {
    sectorNumber: number;
    zone: MapZoneConfig;
    isWarp?: boolean;
};

export default class MainUIScene extends Scene {
    private static readonly EXP_BAR_WIDTH: number = 984;
    private static readonly EXP_BAR_HEIGHT: number = 36;
    private static readonly HP_BAR_WIDTH: number = 460;
    private static readonly HP_BAR_HEIGHT: number = 40;
    private static readonly SUB_BAR_WIDTH: number = 222;
    private static readonly SUB_BAR_HEIGHT: number = 22;
    private static readonly BOSS_BAR_WIDTH: number = 760;
    private static readonly BOSS_BAR_HEIGHT: number = 28;
    private static readonly RADAR_SIZE: number = 176;

    private _expBarFill!: GameObjects.Rectangle;
    private _expBarText!: GameObjects.Text;

    private _hpBarFill!: GameObjects.Rectangle;
    private _hpBarText!: GameObjects.Text;

    private _dashBarFill!: GameObjects.Rectangle;
    private _dashText!: GameObjects.Text;

    private _overdriveBarFill!: GameObjects.Rectangle;
    private _overdriveText!: GameObjects.Text;

    private _bossGroup!: GameObjects.Container;
    private _bossBarFill!: GameObjects.Rectangle;
    private _bossNameText!: GameObjects.Text;

    private _scoreText!: GameObjects.BitmapText;
    private _comboText!: GameObjects.Text;
    private _powerUpsText!: GameObjects.Text;
    private _muteBtnText!: GameObjects.Text;
    private _gamepadBadge!: GameObjects.Text;
    private _sectorBadgeBg!: GameObjects.Rectangle;
    private _sectorBadgeText!: GameObjects.Text;
    private _radarGraphics!: GameObjects.Graphics;
    private _radarOriginX: number = 0;
    private _radarOriginY: number = 0;

    constructor() {
        super(GameConstants.SceneKeys.MAIN_UI);
    }

    // noinspection JSUnusedGlobalSymbols
    init() {
        this.game.events.on(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
        this.game.events.on(GameConstants.Events.EXP_CHANGED_EVENT, this.onExpChanged, this);
        this.game.events.on(GameConstants.Events.POWERUP_CHANGED_EVENT, this.onPowerUpsChanged, this);
        this.game.events.on(GameConstants.Events.RADAR_UPDATE_EVENT, this.onRadarUpdate, this);
        this.game.events.on(GameConstants.Events.AUDIO_CHANGED_EVENT, this.refreshMuteLabel, this);
        this.game.events.on(GameConstants.Events.DASH_CHANGED_EVENT, this.onDashChanged, this);
        this.game.events.on(GameConstants.Events.OVERDRIVE_CHANGED_EVENT, this.onOverdriveChanged, this);
        this.game.events.on(GameConstants.Events.COMBO_CHANGED_EVENT, this.onComboChanged, this);
        this.game.events.on(GameConstants.Events.BOSS_STATUS_EVENT, this.onBossStatus, this);
        this.game.events.on(GameConstants.Events.BOSS_ALERT_EVENT, this.onBossAlert, this);
        this.game.events.on(GameConstants.Events.SECTOR_CHANGED_EVENT, this.onSectorChanged, this);
        this.registry.events.on(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);

        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
            this.game.events.off(GameConstants.Events.EXP_CHANGED_EVENT, this.onExpChanged, this);
            this.game.events.off(GameConstants.Events.POWERUP_CHANGED_EVENT, this.onPowerUpsChanged, this);
            this.game.events.off(GameConstants.Events.RADAR_UPDATE_EVENT, this.onRadarUpdate, this);
            this.game.events.off(GameConstants.Events.AUDIO_CHANGED_EVENT, this.refreshMuteLabel, this);
            this.game.events.off(GameConstants.Events.DASH_CHANGED_EVENT, this.onDashChanged, this);
            this.game.events.off(GameConstants.Events.OVERDRIVE_CHANGED_EVENT, this.onOverdriveChanged, this);
            this.game.events.off(GameConstants.Events.COMBO_CHANGED_EVENT, this.onComboChanged, this);
            this.game.events.off(GameConstants.Events.BOSS_STATUS_EVENT, this.onBossStatus, this);
            this.game.events.off(GameConstants.Events.BOSS_ALERT_EVENT, this.onBossAlert, this);
            this.game.events.off(GameConstants.Events.SECTOR_CHANGED_EVENT, this.onSectorChanged, this);
            this.registry.events.off(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);
        }, this);
    }

    // noinspection JSUnusedGlobalSymbols
    create() {
        const marginX = 48;

        // EXP Bar (full top width)
        const expY = 24;
        this.add.rectangle(marginX, expY, MainUIScene.EXP_BAR_WIDTH, MainUIScene.EXP_BAR_HEIGHT, 0x0f172a, 0.88)
            .setOrigin(0, 0)
            .setStrokeStyle(3, 0x38bdf8, 0.8);

        this._expBarFill = this.add.rectangle(
            marginX + 3,
            expY + 3,
            0,
            MainUIScene.EXP_BAR_HEIGHT - 6,
            0x0ea5e9,
            1
        ).setOrigin(0, 0);

        this._expBarText = this.add.text(
            marginX + MainUIScene.EXP_BAR_WIDTH / 2,
            expY + MainUIScene.EXP_BAR_HEIGHT / 2,
            "LVL 1  •  0 / 4 XP",
            {
                fontSize: '22px',
                fontFamily: 'future, sans-serif',
                color: '#f8fafc',
                stroke: '#000000',
                strokeThickness: 4,
            }
        ).setOrigin(0.5);

        // Health Bar (top-left below EXP bar)
        const hpY = 76;
        this.add.rectangle(marginX, hpY, MainUIScene.HP_BAR_WIDTH, MainUIScene.HP_BAR_HEIGHT, 0x0f172a, 0.88)
            .setOrigin(0, 0)
            .setStrokeStyle(3, 0x475569, 0.9);

        this._hpBarFill = this.add.rectangle(
            marginX + 3,
            hpY + 3,
            MainUIScene.HP_BAR_WIDTH - 6,
            MainUIScene.HP_BAR_HEIGHT - 6,
            0x22c55e,
            1
        ).setOrigin(0, 0);

        this._hpBarText = this.add.text(
            marginX + MainUIScene.HP_BAR_WIDTH / 2,
            hpY + MainUIScene.HP_BAR_HEIGHT / 2,
            "HP 100 / 100",
            {
                fontSize: '22px',
                fontFamily: 'future, sans-serif',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 4,
            }
        ).setOrigin(0.5);

        // Dash Gauge + Overdrive Gauge directly below HP bar
        const subY = 124;
        this.add.rectangle(marginX, subY, MainUIScene.SUB_BAR_WIDTH, MainUIScene.SUB_BAR_HEIGHT, 0x0f172a, 0.88)
            .setOrigin(0, 0).setStrokeStyle(2, 0x2dd4bf, 0.8);
        this._dashBarFill = this.add.rectangle(
            marginX + 2,
            subY + 2,
            MainUIScene.SUB_BAR_WIDTH - 4,
            MainUIScene.SUB_BAR_HEIGHT - 4,
            0x2dd4bf,
            1
        ).setOrigin(0, 0);
        this._dashText = this.add.text(
            marginX + MainUIScene.SUB_BAR_WIDTH / 2,
            subY + MainUIScene.SUB_BAR_HEIGHT / 2,
            "DASH PRÊT",
            {
                fontSize: '14px',
                fontFamily: 'future, sans-serif',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3,
            }
        ).setOrigin(0.5);

        const odX = marginX + MainUIScene.SUB_BAR_WIDTH + 16;
        this.add.rectangle(odX, subY, MainUIScene.SUB_BAR_WIDTH, MainUIScene.SUB_BAR_HEIGHT, 0x0f172a, 0.88)
            .setOrigin(0, 0).setStrokeStyle(2, 0xfacc15, 0.8);
        this._overdriveBarFill = this.add.rectangle(
            odX + 2,
            subY + 2,
            0,
            MainUIScene.SUB_BAR_HEIGHT - 4,
            0xfacc15,
            1
        ).setOrigin(0, 0);
        this._overdriveText = this.add.text(
            odX + MainUIScene.SUB_BAR_WIDTH / 2,
            subY + MainUIScene.SUB_BAR_HEIGHT / 2,
            "OVERDRIVE 0%",
            {
                fontSize: '14px',
                fontFamily: 'future, sans-serif',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3,
            }
        ).setOrigin(0.5);

        // Score (top-right below EXP bar)
        let scoreStr: string = "".padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        if (this.registry.has(RegistryConstants.Keys.PLAYER_SCORE))
            scoreStr = this.registry.get(RegistryConstants.Keys.PLAYER_SCORE).toString()
                .padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText = this.add.bitmapText(this.scale.width - marginX, 74, "future-bmp", scoreStr, 96)
            .setOrigin(1, 0);

        this._comboText = this.add.text(this.scale.width - marginX, 174, "", {
            fontSize: '24px',
            fontFamily: 'future, sans-serif',
            color: '#facc15',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(1, 0);

        // Quick Pause & Mute buttons under score/combo
        const pauseBtnBg = this.add.rectangle(this.scale.width - marginX, 212, 156, 44, 0x0f172a, 0.85)
            .setOrigin(1, 0)
            .setStrokeStyle(2, 0x38bdf8, 0.75)
            .setInteractive({ useHandCursor: true });
        this.add.text(this.scale.width - marginX - 78, 234, 'PAUSE', {
            fontSize: '22px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
        }).setOrigin(0.5);
        pauseBtnBg.on('pointerdown', () => {
            const gameScene = this.scene.get(GameConstants.SceneKeys.MAIN_GAME) as MainGameScene | undefined;
            gameScene?.openPauseModal();
        });

        const muteBtnBg = this.add.rectangle(this.scale.width - marginX - 170, 212, 150, 44, 0x0f172a, 0.85)
            .setOrigin(1, 0)
            .setStrokeStyle(2, 0x64748b, 0.75)
            .setInteractive({ useHandCursor: true });
        this._muteBtnText = this.add.text(this.scale.width - marginX - 245, 234, 'SON ON', {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: '#4ade80',
        }).setOrigin(0.5);
        muteBtnBg.on('pointerdown', () => {
            const audio = this.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
            audio?.toggleMute();
            this.refreshMuteLabel();
        });
        this.refreshMuteLabel();

        // Active temporary power-ups
        this._powerUpsText = this.add.text(marginX, 160, "", {
            fontSize: '24px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
            stroke: '#000000',
            strokeThickness: 4,
            lineSpacing: 6,
        }).setOrigin(0, 0);

        // Boss HP Bar container (centered below top HUD when boss is active)
        this._bossGroup = this.add.container(this.scale.width / 2, 290).setVisible(false);
        const bossBg = this.add.rectangle(0, 0, MainUIScene.BOSS_BAR_WIDTH, MainUIScene.BOSS_BAR_HEIGHT, 0x0f172a, 0.92)
            .setStrokeStyle(3, 0xf43f5e, 0.95);
        this._bossBarFill = this.add.rectangle(
            -MainUIScene.BOSS_BAR_WIDTH / 2 + 3,
            0,
            MainUIScene.BOSS_BAR_WIDTH - 6,
            MainUIScene.BOSS_BAR_HEIGHT - 6,
            0xf43f5e,
            1
        ).setOrigin(0, 0.5);
        this._bossNameText = this.add.text(0, -28, 'BOSS', {
            fontSize: '22px',
            fontFamily: 'future, sans-serif',
            color: '#fda4af',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);
        this._bossGroup.add([bossBg, this._bossBarFill, this._bossNameText]);

        // Tactical Mini-Radar (bottom-right)
        this._radarOriginX = this.scale.width - MainUIScene.RADAR_SIZE - 36;
        this._radarOriginY = this.scale.height - MainUIScene.RADAR_SIZE - 36;
        this.add.rectangle(
            this._radarOriginX,
            this._radarOriginY,
            MainUIScene.RADAR_SIZE,
            MainUIScene.RADAR_SIZE,
            0x0f172a,
            0.78
        ).setOrigin(0, 0).setStrokeStyle(3, 0x38bdf8, 0.65);

        this._radarGraphics = this.add.graphics();

        // Gamepad connection status badge (bottom-left)
        this._gamepadBadge = this.add.text(36, this.scale.height - 36, 'MANETTE CONNECTÉE', {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: '#38bdf8',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0, 1).setVisible(false);

        // Current Sector badge (bottom-center)
        const initialZone = getMapZoneForSector(1);
        this._sectorBadgeBg = this.add.rectangle(this.scale.width / 2, this.scale.height - 54, 460, 44, 0x0f172a, 0.84)
            .setStrokeStyle(2, initialZone.borderInnerColor, 0.85);
        this._sectorBadgeText = this.add.text(
            this.scale.width / 2,
            this.scale.height - 54,
            `SECTEUR 1 : ${initialZone.name}`,
            {
                fontSize: '18px',
                fontFamily: 'future, sans-serif',
                color: initialZone.accentHex,
                stroke: '#000000',
                strokeThickness: 4,
            }
        ).setOrigin(0.5);

        this.scene.bringToTop();

        console.log("MainUIScene created");
    }

    update() {
        if (this._gamepadBadge) {
            this._gamepadBadge.setVisible(isGamepadConnected(this));
        }
    }

    private refreshMuteLabel() {
        if (!this._muteBtnText) return;
        const audio = this.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
        if (audio?.muted) {
            this._muteBtnText.setText('SON OFF').setColor('#f87171');
        } else {
            this._muteBtnText.setText('SON ON').setColor('#4ade80');
        }
    }

    private onDashChanged(status: DashStatus) {
        if (!this._dashBarFill || !this._dashText) return;
        this._dashBarFill.width = (MainUIScene.SUB_BAR_WIDTH - 4) * status.readyRatio;
        if (status.isReady) {
            this._dashBarFill.setFillStyle(0x2dd4bf);
            this._dashText.setText('DASH PRÊT [SHIFT / B]');
        } else {
            this._dashBarFill.setFillStyle(0x0f766e);
            this._dashText.setText('RECHARGE...');
        }
    }

    private onOverdriveChanged(status: OverdriveStatus) {
        if (!this._overdriveBarFill || !this._overdriveText) return;
        const ratio = Phaser.Math.Clamp(status.value / 100, 0, 1);
        this._overdriveBarFill.width = (MainUIScene.SUB_BAR_WIDTH - 4) * ratio;

        if (status.active) {
            this._overdriveBarFill.setFillStyle(0xf97316);
            const sec = Math.ceil(status.remainingMs / 1000);
            this._overdriveText.setText(`OVERDRIVE ${sec}s !`);
        } else {
            this._overdriveBarFill.setFillStyle(0xfacc15);
            this._overdriveText.setText(`OVERDRIVE ${Math.floor(status.value)}%`);
        }
    }

    private onComboChanged(status: ComboStatus) {
        if (!this._comboText) return;
        if (status.count < 2) {
            this._comboText.setText('');
            return;
        }
        this._comboText.setText(`COMBO ${status.count}  (x${status.multiplier})`);
    }

    private onBossStatus(status: BossStatus) {
        if (!this._bossGroup || !this._bossBarFill || !this._bossNameText) return;
        this._bossGroup.setVisible(status.active);
        if (!status.active) return;

        const ratio = status.max > 0 ? Phaser.Math.Clamp(status.current / status.max, 0, 1) : 0;
        this._bossBarFill.width = (MainUIScene.BOSS_BAR_WIDTH - 6) * ratio;
        this._bossNameText.setText(`${status.name}  •  ${Math.max(0, status.current)} / ${status.max}`);
    }

    private onBossAlert(bossName: string) {
        const alertBg = this.add.rectangle(this.scale.width / 2, 420, 880, 96, 0x450a0a, 0.92)
            .setStrokeStyle(4, 0xf43f5e, 1);
        const alertTxt = this.add.text(this.scale.width / 2, 420, `ALERTE BOSS : ${bossName} !`, {
            fontSize: '36px',
            fontFamily: 'future, sans-serif',
            color: '#fecdd3',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5);

        this.tweens.add({
            targets: [alertBg, alertTxt],
            alpha: { from: 1, to: 0.2 },
            duration: 280,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                alertBg.destroy();
                alertTxt.destroy();
            },
        });
    }

    private onSectorChanged(payload: SectorChangedPayload) {
        const { sectorNumber, zone, isWarp } = payload;
        if (this._sectorBadgeBg) {
            this._sectorBadgeBg.setStrokeStyle(2, zone.borderInnerColor, 0.85);
        }
        if (this._sectorBadgeText) {
            this._sectorBadgeText.setText(`SECTEUR ${sectorNumber} : ${zone.name}`);
            this._sectorBadgeText.setColor(zone.accentHex);
        }

        if (!isWarp) return;

        const bannerBg = this.add.rectangle(this.scale.width / 2, 360, 880, 124, 0x0f172a, 0.94)
            .setStrokeStyle(4, zone.borderInnerColor, 1);
        const bannerTitle = this.add.text(
            this.scale.width / 2,
            340,
            `WARP → SECTEUR ${sectorNumber} : ${zone.name}`,
            {
                fontSize: '30px',
                fontFamily: 'future, sans-serif',
                color: zone.accentHex,
                stroke: '#000000',
                strokeThickness: 6,
            }
        ).setOrigin(0.5);
        const bannerSub = this.add.text(
            this.scale.width / 2,
            386,
            `${zone.subtitle}  •  +20 HP RESTAURÉS`,
            {
                fontSize: '20px',
                fontFamily: 'future, sans-serif',
                color: '#e2e8f0',
                stroke: '#000000',
                strokeThickness: 4,
            }
        ).setOrigin(0.5);

        this.tweens.add({
            targets: [bannerBg, bannerTitle, bannerSub],
            alpha: 0,
            delay: 2000,
            duration: 550,
            onComplete: () => {
                bannerBg.destroy();
                bannerTitle.destroy();
                bannerSub.destroy();
            },
        });
    }

    private onRadarUpdate(snapshot: RadarSnapshot) {
        if (!this._radarGraphics) return;

        const g = this._radarGraphics;
        const size = MainUIScene.RADAR_SIZE;
        const ox = this._radarOriginX;
        const oy = this._radarOriginY;

        g.clear();

        // Crosshair guidelines
        g.lineStyle(1, 0x334155, 0.5);
        g.lineBetween(ox + size / 2, oy + 4, ox + size / 2, oy + size - 4);
        g.lineBetween(ox + 4, oy + size / 2, ox + size - 4, oy + size / 2);

        // Power-ups (green dots)
        g.fillStyle(0x4ade80, 0.95);
        for (const p of snapshot.powerUps) {
            g.fillCircle(ox + p.nx * size, oy + p.ny * size, 3.5);
        }

        // Enemies (red dots, larger gold-rimmed marker for Boss)
        for (const e of snapshot.enemies) {
            const ex = ox + e.nx * size;
            const ey = oy + e.ny * size;
            if (e.isBoss) {
                g.fillStyle(0xfacc15, 1);
                g.fillCircle(ex, ey, 7);
                g.fillStyle(0xf43f5e, 1);
                g.fillCircle(ex, ey, 4.5);
            } else {
                g.fillStyle(0xf43f5e, 0.95);
                g.fillCircle(ex, ey, 3);
            }
        }

        // Player (bright cyan dot)
        g.fillStyle(0x38bdf8, 1);
        g.fillCircle(ox + snapshot.player.nx * size, oy + snapshot.player.ny * size, 5);
    }

    private onPlayerScoreChanged(_: any, value: number) {
        const scoreStr: string = value.toString().padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText.setText(scoreStr);
    }

    private onPlayerSpawned(player: Player) {
        this._powerUpsText?.setText("");
        this._bossGroup?.setVisible(false);
        this._comboText?.setText("");

        const health = player.getComponent(Health);
        if (health) {
            this.updateHealthBar(health.current, health.max);
            health.on(Health.CHANGE_EVENT, (current: number) => {
                this.updateHealthBar(current, health.max);
            }, this);
        }

        this.onExpChanged({
            level: player.level,
            exp: player.exp,
            expToNext: player.expToNext,
        });
    }

    private updateHealthBar(current: number, max: number) {
        if (!this._hpBarFill || !this._hpBarText) return;

        const ratio = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
        const innerMaxWidth = MainUIScene.HP_BAR_WIDTH - 6;
        this._hpBarFill.width = innerMaxWidth * ratio;

        if (ratio > 0.5) {
            this._hpBarFill.setFillStyle(0x22c55e);
        } else if (ratio > 0.25) {
            this._hpBarFill.setFillStyle(0xf59e0b);
        } else {
            this._hpBarFill.setFillStyle(0xef4444);
        }

        this._hpBarText.setText(`HP ${Math.max(0, current)} / ${max}`);
    }

    private onExpChanged(status: ExpStatus) {
        if (!this._expBarFill || !this._expBarText) return;

        const ratio = status.expToNext > 0 ? Phaser.Math.Clamp(status.exp / status.expToNext, 0, 1) : 0;
        const innerMaxWidth = MainUIScene.EXP_BAR_WIDTH - 6;
        this._expBarFill.width = innerMaxWidth * ratio;

        this._expBarText.setText(`LVL ${status.level}   •   ${status.exp} / ${status.expToNext} XP`);
    }

    private onPowerUpsChanged(activeBuffs: ActivePowerUpStatus[]) {
        if (!this._powerUpsText) return;

        if (activeBuffs.length === 0) {
            this._powerUpsText.setText("");
            return;
        }

        const lines = activeBuffs.map(buff => {
            const seconds = Math.ceil(buff.remainingMs / 1000);
            return `${buff.label} (${seconds}s)`;
        });

        this._powerUpsText.setText(lines.join('\n'));
    }
}
