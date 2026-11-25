import { Input, Scene } from 'phaser';

export function getActiveGamepad(scene: Scene): Input.Gamepad.Gamepad | null {
    const plugin = scene.input?.gamepad;
    if (!plugin || plugin.total === 0) return null;

    if (plugin.pad1 && plugin.pad1.connected) {
        return plugin.pad1;
    }

    for (const pad of plugin.gamepads) {
        if (pad && pad.connected) return pad;
    }
    return null;
}

export function readGamepadMove(scene: Scene, out: Phaser.Math.Vector2, deadzone: number = 0.18): boolean {
    const pad = getActiveGamepad(scene);
    if (!pad) return false;

    let gx = 0;
    let gy = 0;

    if (pad.leftStick) {
        if (Math.abs(pad.leftStick.x) > deadzone) gx = pad.leftStick.x;
        if (Math.abs(pad.leftStick.y) > deadzone) gy = pad.leftStick.y;
    }

    if (pad.left) gx = -1;
    if (pad.right) gx = 1;
    if (pad.up) gy = -1;
    if (pad.down) gy = 1;

    if (gx === 0 && gy === 0) return false;

    out.set(gx, gy);
    if (out.lengthSq() > 1) {
        out.normalize();
    }
    return true;
}

export function readGamepadRightStick(scene: Scene, out: Phaser.Math.Vector2, deadzone: number = 0.35): boolean {
    const pad = getActiveGamepad(scene);
    if (!pad || !pad.rightStick) return false;

    const rx = pad.rightStick.x;
    const ry = pad.rightStick.y;
    if (rx * rx + ry * ry <= deadzone * deadzone) return false;

    out.set(rx, ry).normalize();
    return true;
}

export type GamepadNavAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause';

/**
 * Edge-triggered gamepad state tracker for menus and pause toggles.
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

    public poll(scene: Scene): Record<GamepadNavAction, boolean> {
        const pad = getActiveGamepad(scene);
        const now: Record<GamepadNavAction, boolean> = {
            up: false,
            down: false,
            left: false,
            right: false,
            confirm: false,
            back: false,
            pause: false,
        };

        if (pad) {
            const stickY = pad.leftStick?.y ?? 0;
            const stickX = pad.leftStick?.x ?? 0;
            now.up = pad.up || stickY < -0.55;
            now.down = pad.down || stickY > 0.55;
            now.left = pad.left || stickX < -0.55;
            now.right = pad.right || stickX > 0.55;
            now.confirm = Boolean(pad.A || pad.buttons[0]?.pressed);
            now.back = Boolean(pad.B || pad.buttons[1]?.pressed);
            now.pause = Boolean(pad.buttons[9]?.pressed || pad.buttons[8]?.pressed);
        }

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

    public reset(scene?: Scene) {
        if (scene) {
            // Sync current held buttons so newly opened menus don't fire stale presses
            this.poll(scene);
            return;
        }
        for (const key of Object.keys(this._prev) as GamepadNavAction[]) {
            this._prev[key] = false;
        }
    }
}
