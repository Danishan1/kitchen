import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Heart, IndianRupee, Plus, Search, Soup, Tag } from 'lucide-react';
import { useApp } from '../store';
import { DietDot, Empty, PageHeader } from '../components/ui';
import { DIFFICULTY_LABEL, RECIPE_CATEGORIES, recipeCategoryLabel } from '../domain/constants';
import { estimateRecipeCost, filterRecipes, missingEquipment, totalTime } from '../domain/recipes';
import { formatMinutes } from '../domain/dates';
import { formatINR } from '../domain/util';

type Sort = 'name' | 'time' | 'recent' | 'cooked';

export function RecipesPage() {
  const { data } = useApp();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [diet, setDiet] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [maxTime, setMaxTime] = useState(0);
  const [favourites, setFavourites] = useState(false);
  const [sort, setSort] = useState<Sort>('name');

  const list = useMemo(() => {
    const r = filterRecipes(data, { q, category, diet, difficulty, maxTime, favourites });
    return r.sort((a, b) => {
      if (sort === 'time') return totalTime(a) - totalTime(b);
      if (sort === 'recent') return (b.lastCooked ?? '').localeCompare(a.lastCooked ?? '');
      if (sort === 'cooked') return b.timesCooked - a.timesCooked;
      return a.name.localeCompare(b.name);
    });
  }, [data, q, category, diet, difficulty, maxTime, favourites, sort]);

  const filtersOn = q || category || diet || difficulty || maxTime || favourites;

  return (
    <div className="page">
      <PageHeader
        title="Recipes"
        sub={`${data.recipes.length} recipes · costs and times are estimates you can edit`}
        actions={
          <>
            <Link className="btn" to="/recipes/prices">
              <IndianRupee /> Ingredient prices
            </Link>
            <Link className="btn primary" to="/recipes/new">
              <Plus /> New recipe
            </Link>
          </>
        }
      />
      <div className="toolbar">
        <div className="search">
          <Search aria-hidden />
          <input type="search" placeholder="Search by name, tag or ingredient (e.g. “bhindi”, “chicken”)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recipes" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {RECIPE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select value={diet} onChange={(e) => setDiet(e.target.value)} aria-label="Diet">
          <option value="">Any diet</option>
          <option value="veg">Veg</option>
          <option value="egg">Egg</option>
          <option value="nonveg">Non-veg</option>
        </select>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty">
          <option value="">Any difficulty</option>
          {Object.entries(DIFFICULTY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={maxTime} onChange={(e) => setMaxTime(Number(e.target.value))} aria-label="Maximum time">
          <option value={0}>Any time</option>
          <option value={20}>≤ 20 min</option>
          <option value={30}>≤ 30 min</option>
          <option value={45}>≤ 45 min</option>
          <option value={60}>≤ 1 hour</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="name">Sort: A–Z</option>
          <option value="time">Sort: quickest</option>
          <option value="recent">Sort: recently cooked</option>
          <option value="cooked">Sort: most cooked</option>
        </select>
        <button className={`btn ${favourites ? 'primary' : ''}`} aria-pressed={favourites} onClick={() => setFavourites((v) => !v)}>
          <Heart /> Favourites
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card">
          <Empty icon={<Soup />} title={filtersOn ? 'No recipes match' : 'No recipes yet'} action={<Link className="btn primary sm" to="/recipes/new">Add a recipe</Link>}>
            {filtersOn ? 'Try clearing a filter or searching for an ingredient.' : 'Add your family’s favourite dishes.'}
          </Empty>
        </div>
      ) : (
        <div className="recipe-grid">
          {list.map((r) => {
            const cost = estimateRecipeCost(r, r.servings, data.ingredients);
            const missing = missingEquipment(r, data.equipment);
            return (
              <Link key={r.id} to={`/recipes/${r.id}`} className="card recipe-card">
                <div className="thumb">{r.photo ? <img src={r.photo} alt="" /> : <Soup aria-hidden />}</div>
                <div className="body">
                  <div className="row gap between top">
                    <h3>{r.name}</h3>
                    {r.favourite && <Heart size={16} fill="var(--danger)" color="var(--danger)" aria-label="Favourite" />}
                  </div>
                  <div className="meta-row">
                    <DietDot diet={r.diet} label />
                    <span>
                      <Clock /> {formatMinutes(totalTime(r))}
                    </span>
                    <span>{DIFFICULTY_LABEL[r.difficulty]}</span>
                    <span>
                      <Tag /> {recipeCategoryLabel(r.category)}
                    </span>
                  </div>
                  <div className="meta-row">
                    <span>
                      ≈ {formatINR(cost.total)} for {r.servings}
                    </span>
                    {r.timesCooked > 0 && <span>Cooked {r.timesCooked}×</span>}
                    {missing.length > 0 && <span className="warn-text">Needs: {missing.map((m) => m.name).join(', ')}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
