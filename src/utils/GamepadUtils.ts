import { Scene } from 'phaser';

export function getRawActiveGamepad(): Gamepad | null {
    try {
        if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
            return null;
        }

        const pads = navigator.getGamepads();
        if (!pads) return null;

        for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            if (pad && pad.connected) {
                return pad;
            }
        }
    } catch {
        return null;
    }

    return null;
}

export function isGamepadConnected(_scene?: Scene): boolean {
    return getRawActiveGamepad() !== null;
}

export function readGamepadMove(_scene: Scene, out: Phaser.Math.Vector2, deadzone: number = 0.18): boolean {
    const pad = getRawActiveGamepad();
    if (!pad) return false;

    let gx = 0;
    let gy = 0;

    const axes = pad.axes;
    if (axes && axes.length >= 2) {
        const ax = axes[0] ?? 0;
        const ay = axes[1] ?? 0;
        if (Math.abs(ax) > deadzone) gx = ax;
        if (Math.abs(ay) > deadzone) gy = ay;
    }

    const buttons = pad.buttons;
    if (buttons) {
        if (buttons[14]?.pressed) gx = -1;
        if (buttons[15]?.pressed) gx = 1;
        if (buttons[12]?.pressed) gy = -1;
        if (buttons[13]?.pressed) gy = 1;
    }

    if (gx === 0 && gy === 0) return false;

    out.set(gx, gy);
    if (out.lengthSq() > 1) {
        out.normalize();
    }
    return true;
}

export function readGamepadRightStick(_scene: Scene, out: Phaser.Math.Vector2, deadzone: number = 0.35): boolean {
    const pad = getRawActiveGamepad();
    if (!pad || !pad.axes || pad.axes.length < 4) return false;

    const rx = pad.axes[2] ?? 0;
    const ry = pad.axes[3] ?? 0;
    if (rx * rx + ry * ry <= deadzone * deadzone) return false;

    out.set(rx, ry).normalize();
    return true;
}

export function isGamepadFireHeld(): boolean {
    const pad = getRawActiveGamepad();
    if (!pad || !pad.buttons) return false;
    return Boolean(
        pad.buttons[0]?.pressed ||
        (pad.buttons[7]?.value ?? 0) > 0.3 ||
        pad.buttons[7]?.pressed
    );
}

export type GamepadNavAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause';

/**
 * Edge-triggered gamepad state tracker reading browser Gamepad API directly.
 */
export class GamepadEdgeTracker {
    private readonly _prev: Record<GamepadNavAction, boolean> = {
        up: false,
        down: false,
        left: false,
        right: false,
        confirm: false,
        back: false,
        pause: false,
    };

    private readCurrentState(): Record<GamepadNavAction, boolean> {
        const pad = getRawActiveGamepad();
        const state: Record<GamepadNavAction, boolean> = {
            up: false,
            down: false,
            left: false,
            right: false,
            confirm: false,
            back: false,
            pause: false,
        };

        if (pad) {
            const stickX = pad.axes?.[0] ?? 0;
            const stickY = pad.axes?.[1] ?? 0;
            const buttons = pad.buttons;

            state.up = Boolean(buttons?.[12]?.pressed) || stickY < -0.55;
            state.down = Boolean(buttons?.[13]?.pressed) || stickY > 0.55;
            state.left = Boolean(buttons?.[14]?.pressed) || stickX < -0.55;
            state.right = Boolean(buttons?.[15]?.pressed) || stickX > 0.55;
            state.confirm = Boolean(buttons?.[0]?.pressed);
            state.back = Boolean(buttons?.[1]?.pressed);
            state.pause = Boolean(buttons?.[9]?.pressed || buttons?.[8]?.pressed);
        }

        return state;
    }

    public poll(_scene?: Scene): Record<GamepadNavAction, boolean> {
        const now = this.readCurrentState();

        const triggered: Record<GamepadNavAction, boolean> = {
            up: now.up && !this._prev.up,
            down: now.down && !this._prev.down,
            left: now.left && !this._prev.left,
            right: now.right && !this._prev.right,
            confirm: now.confirm && !this._prev.confirm,
            back: now.back && !this._prev.back,
            pause: now.pause && !this._prev.pause,
        };

        Object.assign(this._prev, now);
        return triggered;
    }

    public reset(_scene?: Scene) {
        const current = this.readCurrentState();
        Object.assign(this._prev, current);
    }
}
