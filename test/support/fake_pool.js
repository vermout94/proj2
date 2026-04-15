'use strict';

function normalize_sql(sql_text) {
    return String(sql_text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function now_date() {
    return new Date();
}

class FakePool {
    constructor(seed_state) {
        this.state = {
            users: [],
            user_profiles: [],
            password_reset_tokens: [],
            drones: [],
            drone_user_access: [],
            drone_control_parameters: [],
            telemetry: [],
            step_runs: [],
            ...seed_state
        };

        this.next_ids = {
            users: 1,
            profiles: 1,
            reset_tokens: 1,
            drone_access: 1
        };

        for (const user of this.state.users) {
            if (Number(user.id) >= this.next_ids.users) {
                this.next_ids.users = Number(user.id) + 1;
            }
        }
        for (const token of this.state.password_reset_tokens) {
            if (Number(token.id) >= this.next_ids.reset_tokens) {
                this.next_ids.reset_tokens = Number(token.id) + 1;
            }
        }
        for (const access of this.state.drone_user_access) {
            if (Number(access.id) >= this.next_ids.drone_access) {
                this.next_ids.drone_access = Number(access.id) + 1;
            }
        }
    }

    async query(sql_text, params) {
        const sql = normalize_sql(sql_text);
        const args = Array.isArray(params) ? params : [];

        if (sql.startsWith('select id, username, email, password_hash, role, status from users where email = ? limit 1')) {
            const email = String(args[0] || '');
            const found = this.state.users.find((u) => String(u.email) === email);
            return [[found ? {
                id: found.id,
                username: found.username,
                email: found.email,
                password_hash: found.password_hash,
                role: found.role,
                status: found.status
            } : []].flat()];
        }

        if (sql.startsWith('select id, email, status from users where email = ? limit 1') ||
            sql.startsWith('select id,email,status from users where email = ? limit 1')) {
            const email = String(args[0] || '');
            const found = this.state.users.find((u) => String(u.email) === email);
            return [[found ? { id: found.id, email: found.email, status: found.status } : []].flat()];
        }

        if (sql.startsWith('select id, username, email, role, status from users where id = ? limit 1')) {
            const user_id = Number(args[0] || 0);
            const found = this.state.users.find((u) => Number(u.id) === user_id);
            return [[found ? {
                id: found.id,
                username: found.username,
                email: found.email,
                role: found.role,
                status: found.status
            } : []].flat()];
        }

        if (sql.startsWith('select prt.id, prt.user_id from password_reset_tokens prt inner join users u on u.id = prt.user_id where prt.token_hash = ? and prt.used_at is null and prt.expires_at > now() and u.status = "active" limit 1')) {
            const token_hash = String(args[0] || '');
            const candidate = this.state.password_reset_tokens.find((token_row) => {
                if (String(token_row.token_hash) !== token_hash) {
                    return false;
                }
                if (token_row.used_at !== null) {
                    return false;
                }
                if ((new Date(token_row.expires_at)).getTime() <= Date.now()) {
                    return false;
                }
                const owner = this.state.users.find((u) => Number(u.id) === Number(token_row.user_id));
                return !!owner && String(owner.status) === 'active';
            });

            return [[candidate ? { id: candidate.id, user_id: candidate.user_id } : []].flat()];
        }

        if (sql.startsWith('delete from password_reset_tokens where user_id = ? and used_at is null')) {
            const user_id = Number(args[0] || 0);
            const before = this.state.password_reset_tokens.length;
            this.state.password_reset_tokens = this.state.password_reset_tokens.filter((row) => {
                return !(Number(row.user_id) === user_id && row.used_at === null);
            });
            return [{ affectedRows: before - this.state.password_reset_tokens.length }];
        }

        if (sql.startsWith('insert into password_reset_tokens (user_id, token_hash, expires_at) values (?, ?, ?)')) {
            const user_id = Number(args[0] || 0);
            const token_hash = String(args[1] || '');
            const expires_at = new Date(args[2]);
            const new_row = {
                id: this.next_ids.reset_tokens,
                user_id: user_id,
                token_hash: token_hash,
                expires_at: expires_at,
                used_at: null,
                created_at: now_date()
            };
            this.next_ids.reset_tokens += 1;
            this.state.password_reset_tokens.push(new_row);
            return [{ insertId: new_row.id, affectedRows: 1 }];
        }

        if (sql.startsWith('select id, user_id, used_at, expires_at from password_reset_tokens where token_hash = ? limit 1 for update')) {
            const token_hash = String(args[0] || '');
            const found = this.state.password_reset_tokens.find((row) => String(row.token_hash) === token_hash);
            return [[found ? {
                id: found.id,
                user_id: found.user_id,
                used_at: found.used_at,
                expires_at: found.expires_at
            } : []].flat()];
        }

        if (sql.startsWith('update users set password_hash = ?, force_pw_change = 0 where id = ? limit 1')) {
            const password_hash = String(args[0] || '');
            const user_id = Number(args[1] || 0);
            const found = this.state.users.find((u) => Number(u.id) === user_id);
            if (!found) {
                return [{ affectedRows: 0 }];
            }
            found.password_hash = password_hash;
            found.force_pw_change = 0;
            return [{ affectedRows: 1 }];
        }

        if (sql.startsWith('update password_reset_tokens set used_at = now() where user_id = ? and used_at is null')) {
            const user_id = Number(args[0] || 0);
            let count = 0;
            for (const row of this.state.password_reset_tokens) {
                if (Number(row.user_id) === user_id && row.used_at === null) {
                    row.used_at = now_date();
                    count += 1;
                }
            }
            return [{ affectedRows: count }];
        }

        if (sql.startsWith('select id, username, email, role, status, is_protected, created_at from users order by id asc')) {
            const rows = this.state.users
                .slice()
                .sort((a, b) => Number(a.id) - Number(b.id))
                .map((u) => ({
                    id: u.id,
                    username: u.username,
                    email: u.email,
                    role: u.role,
                    status: u.status,
                    is_protected: u.is_protected || 0,
                    created_at: u.created_at || now_date()
                }));
            return [rows];
        }

        if (sql.startsWith('select drone_id, display_name, is_active, is_connected from drones order by drone_id asc')) {
            const rows = this.state.drones
                .slice()
                .sort((a, b) => String(a.drone_id).localeCompare(String(b.drone_id)))
                .map((d) => ({
                    drone_id: d.drone_id,
                    display_name: d.display_name || null,
                    is_active: d.is_active ?? 1,
                    is_connected: d.is_connected ?? 0
                }));
            return [rows];
        }

        if (sql.startsWith('select dua.id, dua.user_id, dua.drone_id, dua.access_level, dua.granted_at, dua.granted_by, d.display_name, d.is_active, d.is_connected from drone_user_access dua inner join drones d on d.drone_id = dua.drone_id order by dua.user_id asc, dua.drone_id asc')) {
            const rows = this.state.drone_user_access
                .slice()
                .sort((a, b) => {
                    if (Number(a.user_id) !== Number(b.user_id)) {
                        return Number(a.user_id) - Number(b.user_id);
                    }
                    return String(a.drone_id).localeCompare(String(b.drone_id));
                })
                .map((a) => {
                    const drone = this.state.drones.find((d) => String(d.drone_id) === String(a.drone_id));
                    return {
                        id: a.id,
                        user_id: a.user_id,
                        drone_id: a.drone_id,
                        access_level: a.access_level,
                        granted_at: a.granted_at || now_date(),
                        granted_by: a.granted_by || null,
                        display_name: drone ? drone.display_name : null,
                        is_active: drone ? (drone.is_active ?? 1) : 0,
                        is_connected: drone ? (drone.is_connected ?? 0) : 0
                    };
                });
            return [rows];
        }

        if (sql.startsWith('insert into users (username, email, password_hash, role, status, is_protected, force_pw_change) values (?, ?, ?, ?, "active", 0, ?)')) {
            const username = String(args[0] || '');
            const email = String(args[1] || '');
            const duplicate = this.state.users.find((u) => String(u.username) === username || String(u.email) === email);
            if (duplicate) {
                const duplicate_error = new Error('Duplicate entry');
                duplicate_error.code = 'ER_DUP_ENTRY';
                throw duplicate_error;
            }

            const new_user = {
                id: this.next_ids.users,
                username: username,
                email: email,
                password_hash: String(args[2] || ''),
                role: String(args[3] || 'user'),
                status: 'active',
                is_protected: 0,
                force_pw_change: Number(args[4] || 0),
                created_at: now_date()
            };
            this.next_ids.users += 1;
            this.state.users.push(new_user);
            return [{ insertId: new_user.id, affectedRows: 1 }];
        }

        if (sql.startsWith('insert into user_profiles (user_id) values (?)')) {
            const user_id = Number(args[0] || 0);
            this.state.user_profiles.push({ id: this.next_ids.profiles, user_id: user_id });
            this.next_ids.profiles += 1;
            return [{ insertId: user_id, affectedRows: 1 }];
        }

        if (sql.startsWith('select id, username, email, role, status, is_protected from users where id = ? limit 1')) {
            const user_id = Number(args[0] || 0);
            const found = this.state.users.find((u) => Number(u.id) === user_id);
            return [[found ? {
                id: found.id,
                username: found.username,
                email: found.email,
                role: found.role,
                status: found.status,
                is_protected: found.is_protected || 0
            } : []].flat()];
        }

        if (sql.startsWith('update users set role = ? where id = ? limit 1')) {
            const role = String(args[0] || 'user');
            const user_id = Number(args[1] || 0);
            const found = this.state.users.find((u) => Number(u.id) === user_id);
            if (!found) {
                return [{ affectedRows: 0 }];
            }
            found.role = role;
            return [{ affectedRows: 1 }];
        }

        if (sql.startsWith('update users set status = ? where id = ? limit 1')) {
            const status = String(args[0] || 'active');
            const user_id = Number(args[1] || 0);
            const found = this.state.users.find((u) => Number(u.id) === user_id);
            if (!found) {
                return [{ affectedRows: 0 }];
            }
            found.status = status;
            return [{ affectedRows: 1 }];
        }

        if (sql.startsWith('update users set force_pw_change = ? where id = ? limit 1')) {
            const force_pw_change = Number(args[0] || 0);
            const user_id = Number(args[1] || 0);
            const found = this.state.users.find((u) => Number(u.id) === user_id);
            if (!found) {
                return [{ affectedRows: 0 }];
            }
            found.force_pw_change = force_pw_change;
            return [{ affectedRows: 1 }];
        }

        if (sql.startsWith('delete from users where id = ? limit 1')) {
            const user_id = Number(args[0] || 0);
            const before = this.state.users.length;
            this.state.users = this.state.users.filter((u) => Number(u.id) !== user_id);
            this.state.drone_user_access = this.state.drone_user_access.filter((a) => Number(a.user_id) !== user_id);
            return [{ affectedRows: before - this.state.users.length }];
        }

        if (sql.startsWith('select drone_id from drones where drone_id = ? limit 1')) {
            const drone_id = String(args[0] || '');
            const found = this.state.drones.find((d) => String(d.drone_id) === drone_id);
            return [[found ? { drone_id: found.drone_id } : []].flat()];
        }

        if (sql.startsWith('insert into drone_user_access (drone_id, user_id, access_level, granted_by) values (?, ?, ?, ?) on duplicate key update access_level = values(access_level), granted_by = values(granted_by), granted_at = now()')) {
            const drone_id = String(args[0] || '');
            const user_id = Number(args[1] || 0);
            const access_level = String(args[2] || 'read');
            const granted_by = Number(args[3] || 0);
            const existing = this.state.drone_user_access.find((a) => String(a.drone_id) === drone_id && Number(a.user_id) === user_id);

            if (existing) {
                existing.access_level = access_level;
                existing.granted_by = granted_by;
                existing.granted_at = now_date();
                return [{ affectedRows: 1 }];
            }

            this.state.drone_user_access.push({
                id: this.next_ids.drone_access,
                drone_id: drone_id,
                user_id: user_id,
                access_level: access_level,
                granted_by: granted_by,
                granted_at: now_date()
            });
            this.next_ids.drone_access += 1;
            return [{ affectedRows: 1, insertId: this.next_ids.drone_access - 1 }];
        }

        if (sql.startsWith('delete from drone_user_access where user_id = ? and drone_id = ? limit 1')) {
            const user_id = Number(args[0] || 0);
            const drone_id = String(args[1] || '');
            const before = this.state.drone_user_access.length;
            this.state.drone_user_access = this.state.drone_user_access.filter((a) => !(Number(a.user_id) === user_id && String(a.drone_id) === drone_id));
            return [{ affectedRows: before - this.state.drone_user_access.length }];
        }

        if (sql.startsWith('select d.drone_id, d.display_name, d.is_connected, d.is_active, d.is_locked, d.last_seen_at, "full" as access_level, count(dua.id) as assigned_user_count from drones d left join drone_user_access dua on dua.drone_id = d.drone_id group by')) {
            const rows = this.state.drones
                .slice()
                .sort((a, b) => String(a.drone_id).localeCompare(String(b.drone_id)))
                .map((d) => ({
                    drone_id: d.drone_id,
                    display_name: d.display_name || null,
                    is_connected: d.is_connected ?? 0,
                    is_active: d.is_active ?? 1,
                    is_locked: d.is_locked ?? 0,
                    last_seen_at: d.last_seen_at || null,
                    access_level: 'full',
                    assigned_user_count: this.state.drone_user_access.filter((a) => String(a.drone_id) === String(d.drone_id)).length
                }));
            return [rows];
        }

        if (sql.startsWith('select d.drone_id, d.display_name, d.is_connected, d.is_active, d.is_locked, d.last_seen_at, dua.access_level, 1 as assigned_user_count from drone_user_access dua inner join drones d on d.drone_id = dua.drone_id where dua.user_id = ? order by d.drone_id asc')) {
            const user_id = Number(args[0] || 0);
            const rows = this.state.drone_user_access
                .filter((a) => Number(a.user_id) === user_id)
                .map((a) => {
                    const d = this.state.drones.find((dr) => String(dr.drone_id) === String(a.drone_id));
                    if (!d) {
                        return null;
                    }
                    return {
                        drone_id: d.drone_id,
                        display_name: d.display_name || null,
                        is_connected: d.is_connected ?? 0,
                        is_active: d.is_active ?? 1,
                        is_locked: d.is_locked ?? 0,
                        last_seen_at: d.last_seen_at || null,
                        access_level: a.access_level,
                        assigned_user_count: 1
                    };
                })
                .filter(Boolean)
                .sort((a, b) => String(a.drone_id).localeCompare(String(b.drone_id)));
            return [rows];
        }

        if (sql.startsWith('select d.drone_id, d.display_name, d.is_connected, d.is_active, d.is_locked, d.last_seen_at, "full" as access_level from drones d where d.drone_id = ? limit 1')) {
            const drone_id = String(args[0] || '');
            const d = this.state.drones.find((dr) => String(dr.drone_id) === drone_id);
            return [[d ? {
                drone_id: d.drone_id,
                display_name: d.display_name || null,
                is_connected: d.is_connected ?? 0,
                is_active: d.is_active ?? 1,
                is_locked: d.is_locked ?? 0,
                last_seen_at: d.last_seen_at || null,
                access_level: 'full'
            } : []].flat()];
        }

        if (sql.startsWith('select d.drone_id, d.display_name, d.is_connected, d.is_active, d.is_locked, d.last_seen_at, dua.access_level from drone_user_access dua inner join drones d on d.drone_id = dua.drone_id where dua.user_id = ? and dua.drone_id = ? limit 1')) {
            const user_id = Number(args[0] || 0);
            const drone_id = String(args[1] || '');
            const access = this.state.drone_user_access.find((a) => Number(a.user_id) === user_id && String(a.drone_id) === drone_id);
            if (!access) {
                return [[]];
            }
            const d = this.state.drones.find((dr) => String(dr.drone_id) === drone_id);
            if (!d) {
                return [[]];
            }
            return [[{
                drone_id: d.drone_id,
                display_name: d.display_name || null,
                is_connected: d.is_connected ?? 0,
                is_active: d.is_active ?? 1,
                is_locked: d.is_locked ?? 0,
                last_seen_at: d.last_seen_at || null,
                access_level: access.access_level
            }]];
        }

        if (sql.startsWith('select kp_ar,ki_ar,kd_ar,kp_ap,ki_ap,kd_ap,kp_rr,ki_rr,kd_rr,kp_rp,ki_rp,kd_rp,kp_ry,ki_ry,kd_ry,source,updated_at from drone_control_parameters where drone_id = ? limit 1')) {
            const drone_id = String(args[0] || '');
            const row = this.state.drone_control_parameters.find((r) => String(r.drone_id) === drone_id);
            return [[row || []].flat()];
        }

        if (sql.startsWith('select count(*) as count_total from telemetry where drone_id = ?')) {
            const drone_id = String(args[0] || '');
            const count = this.state.telemetry.filter((t) => String(t.drone_id) === drone_id).length;
            return [[{ count_total: count }]];
        }

        if (sql.startsWith('select count(*) as count_total from step_runs where drone_id = ? and is_deleted = 0')) {
            const drone_id = String(args[0] || '');
            const count = this.state.step_runs.filter((s) => String(s.drone_id) === drone_id && Number(s.is_deleted || 0) === 0).length;
            return [[{ count_total: count }]];
        }

        if (sql.startsWith('select received_at, is_valid, tick, roll_angle_estimate, pitch_angle_estimate, yaw_rate_setpoint, altitude_estimate from telemetry where drone_id = ? order by received_at desc limit 1')) {
            const drone_id = String(args[0] || '');
            const found = this.state.telemetry
                .filter((t) => String(t.drone_id) === drone_id)
                .sort((a, b) => (new Date(b.received_at)).getTime() - (new Date(a.received_at)).getTime())[0];
            return [[found || []].flat()];
        }

        throw new Error(`Unsupported SQL in FakePool: ${sql}`);
    }

    async getConnection() {
        const parent = this;
        return {
            async beginTransaction() {
                return undefined;
            },
            async commit() {
                return undefined;
            },
            async rollback() {
                return undefined;
            },
            async query(sql_text, params) {
                return parent.query(sql_text, params);
            },
            release() {
                return undefined;
            }
        };
    }
}

module.exports = {
    FakePool
};
