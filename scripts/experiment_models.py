#!/usr/bin/env python3
"""One-off bake-off: ridge vs. gradient boosting vs. XGBoost for the win model.
Same leave-one-season-out protocol as build_wins, same features. Prints RMSE/MAE/
within-N and the over/under record vs. Vegas for each. Not wired into the site."""
import numpy as np
import build_wins as bw

def loso_preds(fit_predict, rows):
    preds = {}
    for holdout in bw.TRAIN_YEARS:
        tr = [r for r in rows if r["year"] != holdout]
        te = [r for r in rows if r["year"] == holdout]
        for r, p in zip(te, fit_predict(tr, te)):
            preds[(r["year"], r["team"])] = float(p)
    return preds

def Xy(rows):
    X = np.array([[np.nan if r["feat"][f] is None else r["feat"][f] for f in bw.FEATURES] for r in rows], float)
    y = np.array([r["wins"] for r in rows], float)
    return X, y

def report(name, preds, rows, vegas):
    err = [preds[(r["year"], r["team"])] - r["wins"] for r in rows]
    w1 = 100*np.mean([abs(e) <= 1 for e in err]); w2 = 100*np.mean([abs(e) <= 2 for e in err])
    m_err, v_err, hits, tot = [], [], 0, 0
    for r in rows:
        wt = vegas.get((r["year"], bw.vnorm(r["team"])))
        if wt is None: continue
        a = r["wins"]; pr = preds[(r["year"], r["team"])]
        m_err.append(pr-a); v_err.append(wt-a)
        if abs(pr-wt) >= 0.5 and a != wt:
            tot += 1; hits += (pr > wt) == (a > wt)
    print(f"{name:16s} RMSE={bw.rmse(err):.3f} MAE={bw.mae(err):.3f} ±1={w1:.0f}% ±2={w2:.0f}%  "
          f"| vs-line RMSE={bw.rmse(m_err):.3f}  O/U={hits}/{tot}={100*hits/max(tot,1):.1f}%")

def main():
    D = bw.load_cfbd(bw.TRAIN_YEARS)
    rows = [r for r in bw.build_rows(bw.TRAIN_YEARS, D) if r["wins"] is not None]
    vegas = bw.load_vegas()
    print(f"{len(rows)} team-seasons\n")

    # ridge (current model)
    def ridge_fp(tr, te):
        m = bw.ridge_fit(tr); return bw.ridge_pred(m, te)
    report("Ridge (current)", loso_preds(ridge_fp, rows), rows, vegas)

    # sklearn gradient boosting (handles NaN natively)
    from sklearn.ensemble import HistGradientBoostingRegressor
    def hgb_fp(tr, te):
        Xtr, ytr = Xy(tr); Xte, _ = Xy(te)
        m = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.03, max_depth=3,
                                          l2_regularization=1.0, min_samples_leaf=25, random_state=17)
        m.fit(Xtr, ytr); return m.predict(Xte)
    report("HistGradBoost", loso_preds(hgb_fp, rows), rows, vegas)

    # XGBoost
    import xgboost as xgb
    def xgb_fp(tr, te):
        Xtr, ytr = Xy(tr); Xte, _ = Xy(te)
        m = xgb.XGBRegressor(n_estimators=400, learning_rate=0.03, max_depth=3,
                             subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
                             min_child_weight=5, random_state=17, verbosity=0)
        m.fit(Xtr, ytr); return m.predict(Xte)
    report("XGBoost", loso_preds(xgb_fp, rows), rows, vegas)

    # simple average of ridge + xgb
    rp = loso_preds(ridge_fp, rows); xp = loso_preds(xgb_fp, rows)
    blend = {k: 0.5*rp[k] + 0.5*xp[k] for k in rp}
    report("Ridge+XGB blend", blend, rows, vegas)

if __name__ == "__main__":
    main()
