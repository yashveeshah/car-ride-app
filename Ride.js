import React, { Component } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  ImageBackground,
  Image,
  Alert,
  KeyboardAvoidingView
} from "react-native";
import * as Permissions from "expo-permissions";
import { BarCodeScanner } from "expo-barcode-scanner";
import firebase from "firebase";
import db from "../config";

const bgImage = require("../assets/background2.png");
const appIcon = require("../assets/appIcon.png");

export default class RideScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      carId: "",
      userId: "",
      domState: "normal",
      hasCameraPermissions: null,
      scanned: false,
      carType: "",
      userName: "",
      email: firebase.auth().currentUser.email
    };
  }

  async componentDidMount() {
    const { email } = this.state;
    await this.getUserDetails(email);
  }

  getCameraPermissions = async () => {
    const { status } = await Permissions.askAsync(Permissions.CAMERA);

    this.setState({
      /*status === "granted" is true when user has granted permission
          status === "granted" is false when user has not granted the permission
        */
      hasCameraPermissions: status === "granted",
      domState: "scanner",
      scanned: false
    });
  };

  handleBarCodeScanned = async ({ type, data }) => {
    this.setState({
      carId: data,
      domState: "normal",
      scanned: true
    });
  };

  handleTransaction = async () => {
    var { carId, userId, email } = this.state;
    await this.getCarDetails(carId);

    var transactionType = await this.checkCarAvailability(carId);

    if (!transactionType) {
      this.setState({ carId: "" });
      Alert.alert("Kindly enter/scan valid car id");
    } else if (transactionType === "under_maintenance") {
      this.setState({
        carId: ""
      });
    } else if (transactionType === "in use") {
      var isEligible = await this.checkUserEligibilityForStartRide(
        userId,
        email
      );

      if (isEligible) {
        var { carType, userName } = this.state;
        this.assignCar(carId, userId, carType, userName, email);
        Alert.alert(
          "You have rented this electric car for the next 1 hour. Enjoy your ride and go green!!!"
        );
        this.setState({
          carAssigned: true
        });

        // For Android users only
        // ToastAndroid.show(
        //   "You have rented the car for next 1 hour. Enjoy your ride!!!",
        //   ToastAndroid.SHORT
        // );
      }
    } else {
      var isEligible = await this.checkUserEligibilityForEndRide(
        carId,
        userId,
        email
      );

      if (isEligible) {
        var {carType, userName } = this.state;
        this.returncar(carId, userId, carType, userName, email);
        Alert.alert("We hope you enjoyed your ride. Please come back soon!");
        this.setState({
          carAssigned: false
        });

        // For Android users only
        // ToastAndroid.show(
        //   "We hope you enjoyed your ride",
        //   ToastAndroid.SHORT
        // );
      }
    }
  };

  getcarDetails = carId => {
    carId = carId.trim();
    db.collection("cars")
      .where("id", "==", carId)
      .get()
      .then(snapshot => {
        snapshot.docs.map(doc => {
          this.setState({
            carType: doc.data().car_type
          });
        });
      });
  };

  getUserDetails = email => {
    db.collection("users")
      .where("email_id", "==", email)
      .get()
      .then(snapshot => {
        snapshot.docs.map(doc => {
          this.setState({
            userName: doc.data().name,
            userId: doc.data().id,
            carAssigned: doc.data().car_assigned
          });
        });
      });
  };

  checkCarAvailability = async carId => {
    const carRef = await db
      .collection("cars")
      .where("id", "==", carId)
      .get();

    var transactionType = "";
    if (carRef.docs.length == 0) {
      transactionType = false;
    } else {
      carRef.docs.map(doc => {
        if (!doc.data().under_maintenance) {
          //if the car is available then transaction type will be rented
          // otherwise it will be return
          transactionType = doc.data().is_car_available ? "rented" : "return";
        } else {
          transactionType = "under_maintenance";
          Alert.alert(doc.data().maintenance_message);
        }
      });
    }

    return transactionType;
  };

  checkUserEligibilityForStartRide = async (userId, email) => {
    const userRef = await db
      .collection("users")
      .where("id", "==", userId)
      .where("email_id", "==", email)
      .get();

    var isUserEligible = false;
    if (userRef.docs.length == 0) {
      this.setState({
        carId: ""
      });
      isUserEligible = false;
      Alert.alert("Invalid user id");
    } else {
      userRef.docs.map(doc => {
        if (!doc.data().car_assigned) {
          isUserEligible = true;
        } else {
          isUserEligible = false;
          Alert.alert("End your current ride to rent another car.");
          this.setState({
            carId: ""
          });
        }
      });
    }

    return isUserEligible;
  };

  checkUserEligibilityForEndRide = async (carId, userId, email) => {
    const transactionRef = await db
      .collection("transactions")
      .where("car_id", "==", carId)
      .where("email_id", "==", email)
      .limit(1)
      .get();
    var isUserEligible = "";
    transactionRef.docs.map(doc => {
      var lastCarTransaction = doc.data();
      if (lastCarTransaction.user_id === userId) {
        isUserEligible = true;
      } else {
        isUserEligible = false;
        Alert.alert("This car has already been rented by another user. Please try renting another car.");
        this.setState({
          carId: ""
        });
      }
    });
    return isUserEligible;
  };

  assignCar = async (carId, userId, carType, userName, email) => {
    //add a transaction
    db.collection("transactions").add({
      user_id: userId,
      user_name: userName,
      car_id: carId,
      car_type: carType,
      date: firebase.firestore.Timestamp.now().toDate(),
      transaction_type: "rented",
      email_id: email
    });
    //change car status
    db.collection("cars")
      .doc(carId)
      .update({
        is_car_available: false
      });
    //change value  of car assigned for user
    db.collection("users")
      .doc(userId)
      .update({
        car_assigned: true
      });

    // Updating local state
    this.setState({
      carId: ""
    });
  };

  returnCar = async (carId, userId, carType, userName, email) => {
    //add a transaction
    db.collection("transactions").add({
      user_id: userId,
      user_name: userName,
      car_id: carId,
      car_type: carType,
      date: firebase.firestore.Timestamp.now().toDate(),
      transaction_type: "return",
      email_id: email
    });
    //change car status
    db.collection("cars")
      .doc(carId)
      .update({
        is_car_available: true
      });
    //change value  of car assigned for user
    db.collection("users")
      .doc(userId)
      .update({
        car_assigned: false
      });

    // Updating local state
    this.setState({
      carId: ""
    });
  };

  render() {
    const { carId, userId, domState, scanned, carAssigned } = this.state;
    if (domState !== "normal") {
      return (
        <BarCodeScanner
          onBarCodeScanned={scanned ? undefined : this.handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
      );
    }
    return (
      <KeyboardAvoidingView behavior="padding" style={styles.container}>
        <View style={styles.upperContainer}>
          <Image source={appIcon} style={styles.appIcon} />
          <Text style={styles.title}>e-ride</Text>
          <Text style={styles.subtitle}>An Eco-Friendly Ride</Text>
        </View>
        <View style={styles.lowerContainer}>
          <View style={styles.textinputContainer}>
            <TextInput
              style={[styles.textinput, { width: "82%" }]}
              onChangeText={text => this.setState({ userId: text })}
              placeholder={"User Id"}
              placeholderTextColor={"#FFFFFF"}
              value={userId}
            />
          </View>
          <View style={[styles.textinputContainer, { marginTop: 25 }]}>
            <TextInput
              style={styles.textinput}
              onChangeText={text => this.setState({ carId: text })}
              placeholder={"Bicycle Id"}
              placeholderTextColor={"#FFFFFF"}
              value={carId}
              autoFocus
            />
            <TouchableOpacity
              style={styles.scanbutton}
              onPress={() => this.getCameraPermissions()}
            >
              <Text style={styles.scanbuttonText}>Scan</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, { marginTop: 25 }]}
            onPress={this.handleTransaction}
          >
            <Text style={styles.buttonText}>
              {carAssigned ? "End Ride" : "Unlock"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#D0E6F0"
  },
  bgImage: {
    flex: 1,
    resizeMode: "cover",
    justifyContent: "center"
  },
  upperContainer: {
    flex: 0.5,
    justifyContent: "center",
    alignItems: "center"
  },
  appIcon: {
    width: 200,
    height: 200,
    resizeMode: "contain",
    marginTop: 80
  },
  title: {
    fontSize: 40,
    fontFamily: "Rajdhani_600SemiBold",
    paddingTop: 20,
    color: "#4C5D70"
  },
  subtitle: {
    fontSize: 20,
    fontFamily: "Rajdhani_600SemiBold",
    color: "#4C5D70"
  },
  lowerContainer: {
    flex: 0.5,
    alignItems: "center"
  },
  textinputContainer: {
    borderWidth: 2,
    borderRadius: 10,
    flexDirection: "row",
    backgroundColor: "#4C5D70",
    borderColor: "#4C5D70"
  },
  textinput: {
    width: "57%",
    height: 50,
    padding: 10,
    borderColor: "#4C5D70",
    borderRadius: 10,
    borderWidth: 3,
    fontSize: 18,
    backgroundColor: "#F88379",
    fontFamily: "Rajdhani_600SemiBold",
    color: "#FFFFFF"
  },
  scanbutton: {
    width: 100,
    height: 50,
    backgroundColor: "#FBE5C0",
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    justifyContent: "center",
    alignItems: "center"
  },
  scanbuttonText: {
    fontSize: 24,
    color: "#4C5D70",
    fontFamily: "Rajdhani_600SemiBold"
  },
  button: {
    width: "43%",
    height: 55,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FBE5C0",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#4C5D70"
  },
  buttonText: {
    fontSize: 24,
    color: "#4C5D70",
    fontFamily: "Rajdhani_600SemiBold"
  }
});
