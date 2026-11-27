import { GameObjects, Input, Scale, Scene, Scenes } from "phaser";
import GameConstants from "../GameConstants.ts";
import Player from "../entities/Player.ts";
import AudioManager from "../managers/AudioManager.ts";
import type { UpgradeDefinition } from "../gameData/UpgradeData.ts";
import { GamepadEdgeTracker } from "../utils/GamepadUtils.ts";
import { drawChamferPanel } from "../utils/UITheme.ts";

type LevelUpData = {
    player: Player;
};

type CardVisual = {
    container: GameObjects.Container;
    frameGfx: GameObjects.Graphics;
    accentHex: number;
    width: number;
    height: number;
};

export default class LevelUpScene extends Scene {
    private _player!: Player;
    private _choices: UpgradeDefinition[] = [];
    private _cards: CardVisual[] = [];
    private _selectedIndex: number = 0;
    private _inputReady: boolean = false;
    private _selectionMade: boolean = false;
    private _audioManager?: AudioManager;
    private readonly _gamepadTracker = new GamepadEdgeTracker();

    constructor() {
        super(GameConstants.SceneKeys.LEVEL_UP);
    }

    create(data: LevelUpData) {
        this._player = data.player;
        this._choices = this._player.getUpgradeChoices(3);
        this._cards = [];
        this._selectedIndex = 0;
        this._inputReady = false;
        this._selectionMade = false;
        this._gamepadTracker.reset(this);

        this._audioManager = this.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
        this._audioManager?.setDucked(true);

        const onResize = () => {
            if (!this._selectionMade && this.scene.isActive(GameConstants.SceneKeys.LEVEL_UP)) {
                this.scene.restart({ player: this._player });
            }
        };
        this.scale.on(Scale.Events.RESIZE, onResize, this);
        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.scale.off(Scale.Events.RESIZE, onResize, this);
            this._audioManager?.setDucked(false);
        }, this);

        if (this._choices.length === 0) {
            this.finishSelection();
            return;
        }

        const width = this.scale.width;
        const height = this.scale.height;
        const cx = width / 2;
        const isWide = width >= 1260;

        // Dimmed tactical backdrop covering full expanded screen
        this.add.rectangle(0, 0, width, height, 0x030712, 0.84).setOrigin(0, 0);

        const headerY = isWide ? 115 : Math.max(96, height * 0.14);
        this.add.text(cx, headerY - 40, `NIVEAU ${this._player.level} ATTEINT`, {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: '#7dd3fc',
        }).setOrigin(0.5);

        this.add.text(cx, headerY + 14, 'AMÉLIORATION SYSTÈME', {
            fontSize: isWide ? '44px' : '42px',
            fontFamily: 'future, sans-serif',
            color: '#f8fafc',
            stroke: '#020617',
            strokeThickness: 7,
            shadow: { offsetX: 0, offsetY: 0, color: '#38bdf8', blur: 16, fill: true },
        }).setOrigin(0.5);

        if (isWide) {
            const cardW = Math.min(390, (width - 180) / 3);
            const cardH = 470;
            const spacing = cardW + 36;
            const cardY = height / 2 + 34;

            this._choices.forEach((choice, index) => {
                const cardX = cx + (index - 1) * spacing;
                this.createVerticalUpgradeCard(cardX, cardY, cardW, cardH, choice, index);
            });
        } else {
            const cardW = Math.min(860, width - 80);
            const cardH = 196;
            const spacing = 216;
            const startY = Math.max(headerY + 175, height / 2 - spacing);

            this._choices.forEach((choice, index) => {
                const cardY = startY + index * spacing;
                this.createHorizontalUpgradeCard(cx, cardY, cardW, cardH, choice, index);
            });
        }

        this.refreshCardHighlight();

        this.add.text(cx, height - 46, 'Cliquer  •  [1] [2] [3]  •  Naviguer + Entrée / Manette [A]', {
            fontSize: '19px',
            color: '#94a3b8',
            align: 'center',
        }).setOrigin(0.5);

        this.time.delayedCall(350, () => {
            this._gamepadTracker.reset(this);
            this._inputReady = true;
        });

        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            if (!this._inputReady || this._selectionMade || event.repeat) return;

            if (event.keyCode === Input.Keyboard.KeyCodes.ONE && this._choices[0]) {
                this.selectUpgrade(this._choices[0]);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.TWO && this._choices[1]) {
                this.selectUpgrade(this._choices[1]);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.THREE && this._choices[2]) {
                this.selectUpgrade(this._choices[2]);
            } else if (
                event.keyCode === Input.Keyboard.KeyCodes.UP
                || event.keyCode === Input.Keyboard.KeyCodes.LEFT
                || event.keyCode === Input.Keyboard.KeyCodes.W
                || event.keyCode === Input.Keyboard.KeyCodes.Z
                || event.keyCode === Input.Keyboard.KeyCodes.A
                || event.keyCode === Input.Keyboard.KeyCodes.Q
            ) {
                this.moveSelection(-1);
            } else if (
                event.keyCode === Input.Keyboard.KeyCodes.DOWN
                || event.keyCode === Input.Keyboard.KeyCodes.RIGHT
                || event.keyCode === Input.Keyboard.KeyCodes.S
                || event.keyCode === Input.Keyboard.KeyCodes.D
            ) {
                this.moveSelection(1);
            } else if (event.keyCode === Input.Keyboard.KeyCodes.ENTER || event.keyCode === Input.Keyboard.KeyCodes.SPACE) {
                if (this._choices[this._selectedIndex]) {
                    this.selectUpgrade(this._choices[this._selectedIndex]);
                }
            }
        });

        this.scene.bringToTop();
    }

    update() {
        if (!this._inputReady || this._selectionMade) return;

        const pad = this._gamepadTracker.poll(this);
        if (pad.up || pad.left) this.moveSelection(-1);
        if (pad.down || pad.right) this.moveSelection(1);
        if (pad.confirm && this._choices[this._selectedIndex]) {
            this.selectUpgrade(this._choices[this._selectedIndex]);
        }
    }

    private moveSelection(delta: number) {
        if (this._choices.length === 0) return;
        this._selectedIndex = (this._selectedIndex + delta + this._choices.length) % this._choices.length;
        this.refreshCardHighlight();
    }

    private refreshCardHighlight() {
        this._cards.forEach((card, idx) => {
            const isSelected = idx === this._selectedIndex;
            card.frameGfx.clear();
            drawChamferPanel(card.frameGfx, 0, 0, card.width, card.height, {
                cut: 16,
                fillColor: isSelected ? 0x162440 : 0x0b1324,
                fillAlpha: 0.96,
                strokeColor: card.accentHex,
                strokeAlpha: isSelected ? 1 : 0.55,
                lineWidth: isSelected ? 3.5 : 2,
                brackets: isSelected,
                bracketLen: 16,
                bracketColor: card.accentHex,
            });
            card.container.setScale(isSelected ? 1.03 : 1);
        });
    }

    private createVerticalUpgradeCard(
        cx: number,
        cy: number,
        w: number,
        h: number,
        choice: UpgradeDefinition,
        index: number
    ) {
        const container = this.add.container(cx, cy + 16).setAlpha(0);
        const accentHex = Number(choice.accentColor.replace('#', '0x'));

        const frameGfx = this.add.graphics();
        const hit = this.add.rectangle(0, 0, w, h, 0x000000, 0)
            .setInteractive({ useHandCursor: true });

        const keyTxt = this.add.text(-w / 2 + 20, -h / 2 + 18, `[${index + 1}]`, {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: choice.accentColor,
        }).setOrigin(0, 0);

        const currentRank = this._player.getUpgradeRank(choice.id);
        const rankLabel = choice.maxRank > 0
            ? (currentRank === 0 ? 'NOUVEAU' : `RANG ${currentRank} → ${currentRank + 1}`)
            : 'BONUS';
        const rankText = this.add.text(w / 2 - 20, -h / 2 + 18, rankLabel, {
            fontSize: '17px',
            fontFamily: 'future, sans-serif',
            color: currentRank === 0 && choice.maxRank > 0 ? '#fde047' : '#cbd5e1',
        }).setOrigin(1, 0);

        const iconSocket = this.add.graphics();
        drawChamferPanel(iconSocket, 0, -96, 134, 134, {
            cut: 14,
            fillColor: 0x13203a,
            fillAlpha: 1,
            strokeColor: accentHex,
            strokeAlpha: 0.8,
            lineWidth: 2,
        });
        const iconHalo = this.add.circle(0, -96, 50, accentHex, 0.16);
        const icon = this.add.image(0, -96, 'sprites', choice.iconFrame).setScale(1.7);

        const titleText = this.add.text(0, 12, choice.title, {
            fontSize: '24px',
            fontFamily: 'future, sans-serif',
            color: choice.accentColor,
            align: 'center',
            wordWrap: { width: w - 36 },
        }).setOrigin(0.5);

        const pipNodes = this.buildRankPips(0, 52, choice, currentRank, accentHex, true);

        const descText = this.add.text(0, 130, choice.description, {
            fontSize: '21px',
            color: '#f8fafc',
            align: 'center',
            lineSpacing: 8,
            wordWrap: { width: w - 44 },
        }).setOrigin(0.5);

        container.add([frameGfx, keyTxt, rankText, iconSocket, iconHalo, icon, titleText, ...pipNodes, descText, hit]);
        this.registerCardEvents(container, frameGfx, hit, accentHex, w, h, choice, index, cy);
    }

    private createHorizontalUpgradeCard(
        cx: number,
        cy: number,
        w: number,
        h: number,
        choice: UpgradeDefinition,
        index: number
    ) {
        const container = this.add.container(cx, cy + 14).setAlpha(0);
        const accentHex = Number(choice.accentColor.replace('#', '0x'));

        const frameGfx = this.add.graphics();
        const hit = this.add.rectangle(0, 0, w, h, 0x000000, 0)
            .setInteractive({ useHandCursor: true });

        const iconX = -w / 2 + 104;
        const iconSocket = this.add.graphics();
        drawChamferPanel(iconSocket, iconX, 0, 126, 126, {
            cut: 14,
            fillColor: 0x13203a,
            fillAlpha: 1,
            strokeColor: accentHex,
            strokeAlpha: 0.8,
            lineWidth: 2,
        });
        const iconHalo = this.add.circle(iconX, 0, 44, accentHex, 0.16);
        const icon = this.add.image(iconX, 0, 'sprites', choice.iconFrame).setScale(1.55);

        const keyTxt = this.add.text(-w / 2 + 200, -48, `[${index + 1}]`, {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: choice.accentColor,
        }).setOrigin(0, 0.5);

        const titleText = this.add.text(-w / 2 + 244, -48, choice.title, {
            fontSize: '28px',
            fontFamily: 'future, sans-serif',
            color: choice.accentColor,
        }).setOrigin(0, 0.5);

        const currentRank = this._player.getUpgradeRank(choice.id);
        const rankLabel = choice.maxRank > 0
            ? (currentRank === 0 ? 'NOUVEAU' : `RANG ${currentRank} → ${currentRank + 1}`)
            : 'BONUS IMMÉDIAT';
        const rankText = this.add.text(w / 2 - 28, -48, rankLabel, {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: currentRank === 0 && choice.maxRank > 0 ? '#fde047' : '#cbd5e1',
        }).setOrigin(1, 0.5);

        const pipNodes = this.buildRankPips(w / 2 - 34, -18, choice, currentRank, accentHex, false);

        const descText = this.add.text(-w / 2 + 200, 24, choice.description, {
            fontSize: '22px',
            color: '#f8fafc',
            lineSpacing: 8,
            wordWrap: { width: w - 240 },
        }).setOrigin(0, 0.5);

        container.add([frameGfx, iconSocket, iconHalo, icon, keyTxt, titleText, rankText, ...pipNodes, descText, hit]);
        this.registerCardEvents(container, frameGfx, hit, accentHex, w, h, choice, index, cy);
    }

    private buildRankPips(
        anchorX: number,
        py: number,
        choice: UpgradeDefinition,
        currentRank: number,
        accentHex: number,
        centered: boolean
    ): GameObjects.GameObject[] {
        const pipNodes: GameObjects.GameObject[] = [];
        if (choice.maxRank <= 0) return pipNodes;

        const pipSpacing = 22;
        const totalW = (choice.maxRank - 1) * pipSpacing;
        const startX = centered ? anchorX - totalW / 2 : anchorX - totalW;
        for (let r = 0; r < choice.maxRank; r++) {
            const px = startX + r * pipSpacing;
            const filled = r < currentRank;
            const isNext = r === currentRank;
            const pip = this.add.circle(
                px,
                py,
                isNext ? 7 : 5.5,
                filled || isNext ? accentHex : 0x1e293b,
                filled ? 1 : isNext ? 0.45 : 0.9
            ).setStrokeStyle(2, filled || isNext ? accentHex : 0x475569, 0.95);
            pipNodes.push(pip);
        }
        return pipNodes;
    }

    private registerCardEvents(
        container: GameObjects.Container,
        frameGfx: GameObjects.Graphics,
        hit: GameObjects.Rectangle,
        accentHex: number,
        w: number,
        h: number,
        choice: UpgradeDefinition,
        index: number,
        targetY: number
    ) {
        this._cards.push({ container, frameGfx, accentHex, width: w, height: h });

        this.tweens.add({
            targets: container,
            y: targetY,
            alpha: 1,
            duration: 180,
            delay: index * 45,
            ease: 'Cubic.easeOut',
        });

        hit.on('pointerover', () => {
            this._selectedIndex = index;
            this.refreshCardHighlight();
        });

        hit.on('pointerdown', () => {
            if (!this._inputReady || this._selectionMade) return;
            this.selectUpgrade(choice);
        });
    }

    private selectUpgrade(choice: UpgradeDefinition) {
        if (this._selectionMade) return;
        this._selectionMade = true;
        this._player.consumePendingLevelUp();
        this._player.applyUpgrade(choice.id);
        this.finishSelection();
    }

    private finishSelection() {
        if (this._player.hasPendingLevelUps()) {
            this.scene.restart({ player: this._player });
        } else {
            this.scene.resume(GameConstants.SceneKeys.MAIN_GAME);
            this.scene.stop();
        }
    }
}
