from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"message": "Backend is working"}

categories =  [{"ID": 1, "name": "Cement"}, {"ID": 2, "name": "Brick"}, {"ID": 3, "name": "Floor"}]
@app.get("/categories")
def get_categories():
    return categories

@app.post("/NewCategory")
def new_category(name):
    categories.append({"ID": len(categories) + 1, "name": name})        
    return {"status": "Category added", "category": categories[-1]}