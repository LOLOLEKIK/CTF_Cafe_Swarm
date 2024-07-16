from pymongo import MongoClient

# Remplacer les valeurs par les informations de votre base de données
MONGO_URI = 'mongodb://<user>:<passwors>@<host>:<port>/ctfDB?authSource=admin'
DATABASE_NAME = 'ctfDB'
CHALLENGES_COLLECTION_NAME = 'challenges'
USERS_COLLECTION_NAME = 'users'
TEAMS_COLLECTION_NAME = 'teams'
LOGS_COLLECTION_NAME = 'logs'
CONFIGS_COLLECTION_NAME = 'ctfconfigs'

try:
    # Se connecter à MongoDB
    client = MongoClient(MONGO_URI)
    print("Connexion à MongoDB réussie")

    # Sélectionner la base de données
    db = client[DATABASE_NAME]
    print(f"Base de données sélectionnée : {DATABASE_NAME}")

    # Lister toutes les collections
    collections = db.list_collection_names()
    print("Collections dans la base de données :")
    for collection_name in collections:
        print(collection_name)

    # Réinitialiser les champs dans la collection 'challenges'
    challenges_collection = db[CHALLENGES_COLLECTION_NAME]
    print(f"Collection sélectionnée : {CHALLENGES_COLLECTION_NAME}")

    challenges_count = challenges_collection.count_documents({})
    print(f"Nombre de documents dans la collection challenges : {challenges_count}")

    if challenges_count > 0:
        update_result = challenges_collection.update_many(
            {},
            {
                "$set": {
                    "firstBlood": "none",
                    "solveCount": 0
                }
            }
        )
        print(f"Nombre de documents mis à jour dans challenges : {update_result.modified_count}")
    else:
        print("La collection challenges est vide.")

    # Réinitialiser les champs dans la collection 'Users'
    users_collection = db[USERS_COLLECTION_NAME]
    print(f"Collection sélectionnée : {USERS_COLLECTION_NAME}")

    users_count = users_collection.count_documents({})
    print(f"Nombre de documents dans la collection Users : {users_count}")

    if users_count > 0:
        update_result = users_collection.update_many(
            {},
            {
                "$set": {
                    "solved": [],
                    "hintsBought": [],
                    "score": 0,
                    "adminPoints": 0,
                    "teamId": None,
                }
            }
        )
        print(f"Nombre de documents mis à jour dans Users : {update_result.modified_count}")
    else:
        print("La collection Users est vide.")

    # Supprimer tous les documents de la collection 'Teams'
    teams_collection = db[TEAMS_COLLECTION_NAME]
    print(f"Collection sélectionnée : {TEAMS_COLLECTION_NAME}")

    teams_count = teams_collection.count_documents({})
    print(f"Nombre de documents dans la collection Teams : {teams_count}")

    if teams_count > 0:
        delete_result = teams_collection.delete_many({})
        print(f"Nombre de documents supprimés dans Teams : {delete_result.deleted_count}")
    else:
        print("La collection Teams est vide.")

    # Supprimer tous les documents de la collection 'logs'
    logs_collection = db[LOGS_COLLECTION_NAME]
    print(f"Collection sélectionnée : {LOGS_COLLECTION_NAME}")

    logs_count = logs_collection.count_documents({})
    print(f"Nombre de documents dans la collection logs : {logs_count}")

    if logs_count > 0:
        delete_result = logs_collection.delete_many({})
        print(f"Nombre de documents supprimés dans logs : {delete_result.deleted_count}")
    else:
        print("La collection logs est vide.")

    # Supprimer toutes les notifications dans la collection 'ctfConfigs'
    configs_collection = db[CONFIGS_COLLECTION_NAME]
    print(f"Collection sélectionnée : {CONFIGS_COLLECTION_NAME}")
    for doc in configs_collection.find():
        print(doc)

    notifications_count = configs_collection.count_documents({"name": "notifications"})
    print(f"Nombre de documents avec 'name'='notifications' dans ctfConfigs : {notifications_count}")

    if notifications_count > 0:
        update_result = configs_collection.update_one(
            {"name": "notifications"},
            {
                "$set": {
                    "value": []
                }
            }
        )
        print(f"Notifications mises à jour : {update_result.modified_count}")

        # Vérifier si la mise à jour a été effectuée correctement
        notifications_doc = configs_collection.find_one({"name": "notifications"})
        print("Document notifications après mise à jour :")
        # print(notifications_doc)
    else:
        print("Pas de document 'notifications' trouvé dans la collection ctfConfigs.")

except Exception as e:
    print(f"Erreur lors de la connexion ou de l'accès à MongoDB : {e}")
finally:
    # Fermer la connexion
    client.close()
    print("Connexion à MongoDB fermée")
