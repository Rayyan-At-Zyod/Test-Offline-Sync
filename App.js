import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Button,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

// API endpoint for data operations
const DATA_API = "https://67ade7ac9e85da2f020ba999.mockapi.io/rayyan/posts";

export default function App() {
  // State management for app data and UI
  const [data, setData] = useState([]);
  const [isOffline, setIsOffline] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSyncing, setIsSyncing] = useState(false); // New state to track sync status
  const [refreshing, setRefreshing] = useState(false); // New state to track refresh status

  // Load data from API or cache based on connectivity
  const loadData = async () => {
    const netInfo = await NetInfo.fetch();
    setIsOffline(!netInfo.isConnected);

    if (netInfo.isConnected) {
      try {
        const response = await fetch(DATA_API);
        const result = await response.json();
        setData(result);
        // Cache the fetched data
        await AsyncStorage.setItem("cachedData", JSON.stringify(result));
      } catch (error) {
        console.error("Failed to fetch data:", error);
        // Fallback to cached data if API fetch fails
        const cachedData = await AsyncStorage.getItem("cachedData");
        if (cachedData) {
          setData(JSON.parse(cachedData));
        }
      }
    } else {
      try {
        const cachedData = await AsyncStorage.getItem("cachedData");
        if (cachedData) {
          setData(JSON.parse(cachedData));
        }
      } catch (error) {
        console.error("Failed to load data from cache:", error);
      }
    }
  };

  // Function to handle the refresh action
  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Queue offline actions for later sync
  const queueAction = async (action) => {
    try {
      const pendingActions = await AsyncStorage.getItem("pendingActions");
      const actions = pendingActions ? JSON.parse(pendingActions) : [];
      actions.push(action);
      await AsyncStorage.setItem("pendingActions", JSON.stringify(actions));
    } catch (error) {
      console.error("Failed to queue action:", error);
    }
  };

  // Sync pending actions when back online
  const syncPendingActions = async () => {
    if (isSyncing) return; // Prevent multiple simultaneous syncs

    try {
      setIsSyncing(true);
      const pendingActions = await AsyncStorage.getItem("pendingActions");

      if (pendingActions) {
        const actions = JSON.parse(pendingActions);

        // Process each pending action sequentially
        for (const action of actions) {
          try {
            if (action.type === "ADD") {
              const response = await fetch(DATA_API, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(action.payload),
              });
              if (!response.ok) throw new Error("Failed to sync ADD action");
            } else if (action.type === "DELETE") {
              const response = await fetch(`${DATA_API}/${action.payload}`, {
                method: "DELETE",
              });
              if (!response.ok) throw new Error("Failed to sync DELETE action");
            }
          } catch (error) {
            console.error("Failed to sync action:", action, error);
            // Keep the failed action in queue
            continue;
          }
        }

        // Clear pending actions after successful sync
        await AsyncStorage.removeItem("pendingActions");
      }
    } catch (error) {
      console.error("Failed to sync pending actions:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Add new post - handles both online and offline scenarios
  const addPost = async () => {
    if (title && description) {
      const newPost = { title, description };

      if (isOffline) {
        // Queue action and update UI optimistically
        const tempId = Date.now().toString();
        await queueAction({ type: "ADD", payload: newPost });
        setData([...data, { ...newPost, id: tempId }]);
      } else {
        try {
          const response = await fetch(DATA_API, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(newPost),
          });
          const result = await response.json();
          setData([...data, result]);
        } catch (error) {
          console.error("Failed to add post:", error);
          // Queue action if online request fails
          await queueAction({ type: "ADD", payload: newPost });
        }
      }

      setTitle("");
      setDescription("");
    }
  };

  // Delete post - handles both online and offline scenarios
  const deletePost = async (id) => {
    if (isOffline) {
      // Queue delete action and update UI optimistically
      await queueAction({ type: "DELETE", payload: id });
      setData(data.filter((item) => item.id !== id));
    } else {
      try {
        const response = await fetch(`${DATA_API}/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Delete failed");
        setData(data.filter((item) => item.id !== id));
      } catch (error) {
        console.error("Failed to delete post:", error);
        // Queue delete action if online request fails
        await queueAction({ type: "DELETE", payload: id });
      }
    }
  };

  // Initial data load
  useEffect(() => {
    loadData();
  }, []);

  // Network connectivity monitoring and auto-sync
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
      if (state.isConnected && !isSyncing) {
        syncPendingActions().then(() => loadData());
      }
    });

    return () => unsubscribe();
  }, [isSyncing]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Offline-Sync App</Text>
      <Text>
        Status: {isOffline ? "Offline" : "Online"}
        {isSyncing ? " (Syncing...)" : ""}
      </Text>

      <View>
        <Text style={styles.header}>Add Post</Text>
        <TextInput
          style={styles.input}
          placeholder="Title"
          value={title}
          onChangeText={(text) => setTitle(text)}
        />
        <TextInput
          style={styles.input}
          placeholder="Description"
          value={description}
          onChangeText={(text) => setDescription(text)}
        />
        <Button
          title="Add Post"
          onPress={addPost}
          disabled={!title || !description || isSyncing}
        />
      </View>

      {/* Wrap FlatList and Button in a View */}
      <View style={styles.listContainer}>
        <FlatList
          data={data}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() => deletePost(item.id)}
            >
              <Text style={styles.title}>TITLE: {item.title}</Text>
              <Text style={styles.title}>DESCRIPTION: {item.description}</Text>
            </TouchableOpacity>
          )}
          refreshControl={
            !isOffline && (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            )
          }
        />
        {/* Add margin to the Button */}
        {!isOffline && (
          <View style={styles.buttonContainer}>
            <Button title="Reload" onPress={onRefresh} disabled={isSyncing} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    marginBottom: 20,
    padding: 10,
  },
  container: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 50 : 25,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  item: {
    backgroundColor: "#087650",
    padding: 20,
    marginVertical: 8,
  },
  title: {
    fontSize: 16,
    color: "#fff",
  },
  listContainer: {
    flex: 1, // Ensure FlatList takes up remaining space
  },
  buttonContainer: {
    marginBottom: 20, // Add margin to the button
  },
});
